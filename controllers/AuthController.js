const jwt = require("jsonwebtoken");
require("dotenv").config();
const sql = require("mssql");
const bcrypt = require("bcrypt");
const JWT_SECRET = process.env.JWT_SECRET;
const generateToken = (user) => {
  return jwt.sign(
    {
      regdNo: user.regdNo,
      username: user.username,
      mobile: user.mobile,
      hostler: user.hostler,
      gender: user.gender,
      campus: user.campus,
    },
    JWT_SECRET,
    { expiresIn: "10m" }
  );
};
const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000);
};

module.exports = {
  register: async (req, res) => {
    const { regdNo, username, mobile, gender, campus, password } = req.body;
    // body: {
    //     "regdNo": "502849",
    //     "username": "jeevan",
    //     "mobile": "12345",
    //     "gender": "M",
    //     "campus": "VSP",
    //     "password": "weewe22"
    // }
    try {
      const pool = req.app.locals.sql;
      const request = pool.request();
      request.input("regdNo", sql.VarChar, regdNo);
      const userExists = await request.query(
        "SELECT * FROM GSecurityMaster WHERE regdNo = @regdNo"
      );
      if (userExists.recordset.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      request.input("username", sql.VarChar, username);
      request.input("mobile", sql.VarChar, mobile);
      request.input("gender", sql.VarChar, gender);
      request.input("campus", sql.VarChar, campus);
      request.input("password", sql.VarChar, hashedPassword);

      await request.query(
        "INSERT INTO GSecurityMaster (regdNo, username, mobile, gender, campus, password) " +
          "VALUES (@regdNo, @username, @mobile,  @gender, @campus, @password)"
      );
      res.json({ message: "User registered successfully" });
    } catch (err) {
      console.log("err: ", err);
      res.status(500).json({ error: "An error occurred during registration" });
    }
  },
  login: async (req, res) => {
    const { username, password } = req.body;
    // BODY {
    //   "regdNo": "502849",
    //   "password": "22323"
    // }
    try {
      const pool = req.app.locals.sql;
      const request = pool.request();

      request.input("username", sql.VarChar, username);
      const result = await request.query(
        "SELECT * FROM GSecurityMaster WHERE username = @username"
      );

      if (result.recordset.length === 0) {
        return res.status(401).json({ error: "Invalid registration number" });
      }

      const user = result.recordset[0];
      console.log("user1: ", user);

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      const token = generateToken(user);
      const tokenRequest = pool.request();
      tokenRequest.input("username", sql.VarChar, username);
      tokenRequest.input("token", sql.NVarChar, token);
      await tokenRequest.query(
        "MERGE INTO GSecurityMaster AS target " +
          "USING (SELECT @username AS username) AS source " +
          "ON (target.username = source.username) " +
          "WHEN MATCHED THEN UPDATE SET token = @token " +
          "WHEN NOT MATCHED THEN INSERT (username, token) VALUES (@username, @token);"
      );

      res.json({ status: "Login Successfull", token: token });
    } catch (err) {
      console.log("err: ", err);
      res.status(500).json({ error: "An error occurred during login" });
    }
  },
  loginWithOtp: async (req, res) => {
    const { mobile, otp } = req.body;
    // Body:{"mobile":"12345","otp":"2344"}
    try {
      const pool = req.app.locals.sql;
      const request = pool.request();

      request.input("mobile", sql.VarChar(sql.MAX), mobile);
      request.input("otp", sql.Int, otp);

      const otpValidationResult = await request.query(
        "SELECT * FROM GSecurityMaster WHERE mobile = @mobile AND otp = @otp"
      );

      if (otpValidationResult.recordset.length === 0) {
        return res.status(400).json({ error: "Invalid OTP" });
      }

      const otpData = otpValidationResult.recordset[0];
      const otpCreationTime = new Date(otpData.createdAt);
      const currentTime = new Date();
      const timeDifference = (currentTime - otpCreationTime) / (1000 * 60);

      if (timeDifference > 5) {
        return res.status(400).json({ error: "OTP has expired" });
      }

      const userResult = await request.query(
        "SELECT * FROM GSecurityMaster WHERE mobile = @mobile"
      );

      const user = userResult.recordset[0];

      res.json({
        message: "Login successful",
        user: {
          name: user.name,
          mobile: user.mobile,
          hostler: user.hostler,
          gender: user.gender,
          campus: user.campus,
        },
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "An error occurred during login with OTP" });
    }
  },
  logout: async (req, res) => {
    const { regdNo } = req.params;
    // BODY    {
    //     "regdNo":"502849",
    // }
    try {
      const pool = req.app.locals.sql;
      const request = pool.request();
      request.input("regdNo", sql.VarChar, regdNo);
      await request.query("DELETE FROM GSecurityMaster WHERE regdNo = @regdNo");
      res.json({ message: "Logged out successfully" });
    } catch (err) {
      res.status(500).json({ error: "An error occurred during logout" });
    }
  },
  generateAndStoreOtp: async (req, res) => {
    const { mobile } = req.body;
    // Body :{"mobile":"12345"}
    try {
      const pool = req.app.locals.sql;
      const request = pool.request();
      const generatedOtp = generateOtp();
      const createdAt = new Date();

      request.input("mobile", sql.VarChar(sql.MAX), mobile);
      request.input("otp", sql.Int, generatedOtp);
      request.input("createdAt", sql.DateTime, createdAt);
      const checkResult = await request.query(
        "SELECT * FROM GSecurityMaster WHERE mobile = @mobile"
      );

      if (checkResult.recordset.length === 0) {
        return res.status(404).json({ error: "Mobile number not registered" });
      }
      const otpResult = await request.query(
        `
        IF EXISTS (SELECT * FROM GSecurityMaster WHERE mobile = @mobile)
        BEGIN
          UPDATE GSecurityMaster SET otp = @otp, createdAt = @createdAt WHERE mobile = @mobile
        END
        ELSE
        BEGIN
          INSERT INTO GSecurityMaster (mobile, otp, createdAt) VALUES (@mobile, @otp, @createdAt)
        END
        `
      );

      res.json({
        message: "OTP generated and stored successfully",
        otp: generatedOtp,
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "An error occurred while generating the OTP" });
    }
  },
};
