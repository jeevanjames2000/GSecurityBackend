require("dotenv").config();
const sql = require("mssql");
const multer = require("multer");
const { Expo } = require("expo-server-sdk");
const path = require("path");
const fs = require("fs");
const moment = require("moment");
const uploadFolder = path.join(__dirname, "../uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { files: 5, fileSize: 1024 * 1024 * 5 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
}).array("images[]", 5);
let expo = new Expo();
module.exports = {
  sample: async (req, res) => {
    const { regdNo } = req.params;
    try {
      const pool = req.app.locals.sql;
      const result = await pool
        .request()
        .input("regdNo", sql.VarChar(sql.MAX), regdNo)
        .query("SELECT * FROM GSecurityMaster");
      res.status(200).json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
  reportViolation: async (req, res) => {
    upload(req, res, async (err) => {
      if (err) {
        console.error("Error uploading files:", err);
        return res.status(500).json({ error: "Error uploading files" });
      }
      const {
        name,
        vehicle_number,
        comments,
        totalFines,
        violationType,
        regdNo_empId,
        reported_by,
      } = req.body;
      if (![vehicle_number, comments, violationType].every(Boolean)) {
        return res
          .status(400)
          .json({ error: "Please enter all the required fields" });
      }
      const currentDateTime = moment().format("YYYY-MM-DD");
      const violation_type = Array.isArray(violationType)
        ? violationType.join(",")
        : violationType;
      const pics =
        req.files?.map(
          (file) =>
            `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
        ) || [];
      try {
        const pool = req.app.locals.sql;
        await pool
          .request()
          .input("name", sql.VarChar, name)
          .input("vehicle_number", sql.VarChar, vehicle_number)
          .input("violation_type", sql.VarChar, violation_type)
          .input("comments", sql.VarChar, comments)
          .input("totalFines", sql.Int, totalFines)
          .input("regdNo_empId", sql.VarChar, regdNo_empId)
          .input("reported_by", sql.VarChar, reported_by)
          .input("reported_date", sql.DateTime, currentDateTime)
          .input("pics", sql.VarChar, pics.join(",")).query(`
          INSERT INTO ReportViolations (name, vehicle_number, violation_type, comments, totalFines, pics, regdNo_empId, reported_by,reported_date)
          VALUES (@name, @vehicle_number, @violation_type, @comments, @totalFines, @pics, @regdNo_empId, @reported_by,@reported_date);
        `);
        return res.status(200).json({
          message: "Violation reported successfully",
          violation: {
            name,
            vehicle_number,
            violation_type,
            comments,
            totalFines,
            pics,
            regdNo_empId,
            reported_by,
          },
        });
      } catch (error) {
        console.error("Error saving violation:", error);
        return res.status(500).json({ error: "Error saving violation" });
      }
    });
  },
  getViolations: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const result = await pool
        .request()
        .query("SELECT * FROM ReportViolations");
      res.status(200).json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
  getCardByID: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const { searchQuery } = req.query;
      if (!searchQuery || searchQuery.trim().length === 0) {
        return res.status(400).json({ error: "Invalid search query." });
      }
      const normalizedQuery = searchQuery.toLowerCase();
      const request = pool
        .request()
        .input("searchQuery", sql.VarChar, searchQuery);
      if (normalizedQuery.startsWith("gp")) {
        const gatePassQuery = `
        SELECT * 
        FROM CreateGatePass 
        WHERE LOWER(pass_no) = LOWER(@searchQuery) 
          OR LOWER(vehicle_number) = LOWER(@searchQuery)
      `;
        const gatePassResult = await request.query(gatePassQuery);
        if (gatePassResult.recordset.length === 0) {
          return res.status(404).json({ message: "GatePass not found." });
        }
        const gatePassData = gatePassResult.recordset[0];
        const passId = gatePassData.id;
        const particularsQuery = `
        SELECT id, particular, qty
        FROM gatepass_particulars 
        WHERE pass_id = @passId
      `;
        const particularsResult = await pool
          .request()
          .input("passId", sql.Int, passId)
          .query(particularsQuery);
        return res.status(200).json({
          source: "GatePass",
          data: {
            gatePass: gatePassData,
            particulars: particularsResult.recordset,
          },
        });
      } else if (normalizedQuery.startsWith("vm")) {
        const visitorsQuery = `
        SELECT * 
        FROM visitor_management 
        WHERE LOWER(visitor_id) = LOWER(@searchQuery)
      `;
        const visitorResult = await request.query(visitorsQuery);
        if (visitorResult.recordset.length > 0) {
          return res.status(200).json({
            source: "VisitorManagement",
            data: visitorResult.recordset,
          });
        }
      } else {
        const violationsQuery = `
        SELECT * 
        FROM ReportViolations 
        WHERE LOWER(regdNo_empId) = LOWER(@searchQuery)
      `;
        const violationResult = await request.query(violationsQuery);
        if (violationResult.recordset.length > 0) {
          return res.status(200).json({
            source: "Violations",
            data: violationResult.recordset,
          });
        }
      }
      return res
        .status(404)
        .json({ message: "No data found in any database." });
    } catch (err) {
      console.error("Error searching databases:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  updateVisitors: async (req, res) => {
    const { visitor_id, otp, status } = req.body;
    const pool = req.app.locals.sql;
    const transaction = pool.transaction();
    try {
      await transaction.begin();
      const passQuery = await transaction
        .request()
        .input("otp", sql.VarChar(sql.MAX), otp)
        .input("visitor_id", sql.VarChar(sql.MAX), visitor_id).query(`
        SELECT otp 
        FROM visitor_management 
        WHERE visitor_id = @visitor_id
      `);
      if (passQuery.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Pass not found" });
      }
      await transaction
        .request()
        .input("visitor_id", sql.VarChar(sql.MAX), visitor_id)
        .input("status", sql.VarChar(sql.MAX), status)
        .input("otp", sql.VarChar(sql.MAX), otp).query(`
        UPDATE visitor_management
        SET status = @status
        WHERE visitor_id = @visitor_id 
      `);
      await transaction.commit();
      const message =
        status === "approved"
          ? "Pass approved successfully"
          : "Pass rejected successfully";
      return res.status(200).json({
        message,
        updatedDetails: {
          visitor_id,
          status,
        },
      });
    } catch (error) {
      await transaction.rollback();
      return res.status(500).json({ error: "Error updating " });
    }
  },
  expoPushToken: async (req, res) => {
    const { pushToken, regdNo } = req.body;
    const pool = req.app.locals.sql;
    try {
      const checkUserQuery = `
            SELECT * FROM GSecurityMaster WHERE regdNo = @regdNo
        `;
      const userExists = await pool
        .request()
        .input("regdNo", sql.VarChar(sql.MAX), regdNo)
        .query(checkUserQuery);
      if (userExists.recordset.length > 0) {
        const updateTokenQuery = `
                UPDATE GSecurityMaster
                SET pushToken = @pushToken
                WHERE regdNo = @regdNo
            `;
        await pool
          .request()
          .input("pushToken", sql.VarChar(sql.MAX), pushToken)
          .input("regdNo", sql.VarChar(sql.MAX), regdNo)
          .query(updateTokenQuery);
        res.status(200).send({ message: "Push token updated successfully." });
      } else {
        const insertUserQuery = `
                INSERT INTO GSecurityMaster (pushToken)
                VALUES (@pushToken) Where regdNo = @regdNo
            `;
        await pool
          .request()
          .input("regdNo", sql.VarChar(sql.MAX), regdNo)
          .input("pushToken", sql.VarChar(sql.MAX), pushToken)
          .query(insertUserQuery);
        res
          .status(201)
          .send({ message: "New user and push token inserted successfully." });
      }
    } catch (error) {
      console.error("Error handling push token:", error);
      res.status(500).send({ message: "Internal server error." });
    }
  },
  expoPushNotification: async (req, res) => {
    const pool = req.app.locals.sql;
    try {
      const { pushTokens, title, body, data } = req.body;
      if (
        !pushTokens ||
        !Array.isArray(pushTokens) ||
        pushTokens.length === 0
      ) {
        return res.status(400).json({ error: "Invalid pushTokens array" });
      }
      let messages = [];
      let tokenStatus = {};
      for (let pushToken of pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
          console.warn(
            `Push token ${pushToken} is not a valid Expo push token`
          );
          tokenStatus[pushToken] = 1;
          continue;
        }
        messages.push({
          to: pushToken,
          sound: "default",
          title,
          body,
          data: data || {},
        });
        tokenStatus[pushToken] = 1;
      }
      let chunks = expo.chunkPushNotifications(messages);
      let tickets = [];
      for (let chunk of chunks) {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          tokenStatus[messages[index].to] = 2;
        }
      });
      for (const pushToken of pushTokens) {
        try {
          await pool
            .request()
            .input("pushToken", sql.VarChar(sql.MAX), pushToken)
            .input("pushNotificationStatus", sql.Int, tokenStatus[pushToken])
            .query(`
                        UPDATE GSecurityMaster 
                        SET pushNotificationStatus = @pushNotificationStatus 
                        WHERE pushToken = @pushToken
                    `);
        } catch (dbError) {
          console.error(
            `Error updating pushNotificationStatus for ${pushToken}:`,
            dbError
          );
        }
      }
      res.json({ success: true, tickets });
    } catch (error) {
      console.error("Error sending push notification:", error);
      res.status(500).json({ error: "Failed to send push notification" });
    }
  },
  getAllPushTokens: async (req, res) => {
    const { regdNo } = req.params;
    const pool = req.app.locals.sql;
    try {
      const query = `SELECT pushToken FROM GSecurityMaster WHERE regdNo <> @regdNo AND pushToken IS NOT NULL;`;
      const result = await pool.request().input("regdNo", regdNo).query(query);
      if (result.recordset.length > 0) {
        const pushTokens = result.recordset.map((row) => row.pushToken);
        res.status(200).json({ success: true, pushTokens });
      } else {
        res
          .status(404)
          .json({ success: false, message: "No push tokens found." });
      }
    } catch (error) {
      console.error("Error fetching push tokens:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
  communications: async (req, res) => {
    const pool = req.app.locals.sql;
    try {
      const { regdNo, mobile, username, message } = req.body;
      if (!mobile || !username || !message) {
        return res.status(400).json({ error: "All fields are required." });
      }
      const insertQuery = `
            INSERT INTO Communications (regdNo, mobile, username, message,time)
            VALUES (@regdNo, @mobile, @username, @message,@time)
        `;
      const dateTimeNow = new Date();
      await pool
        .request()
        .input("regdNo", sql.VarChar(sql.MAX), regdNo)
        .input("mobile", sql.VarChar(sql.MAX), mobile)
        .input("username", sql.VarChar(sql.MAX), username)
        .input("message", sql.VarChar(sql.MAX), message)
        .input("time", sql.DateTime, dateTimeNow)
        .query(insertQuery);
      res
        .status(200)
        .json({ success: true, message: "Message stored successfully." });
    } catch (error) {
      console.error("Error storing message:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
  getAllMessages: async (req, res) => {
    const pool = req.app.locals.sql;
    try {
      const dateQuery = `
      SELECT DISTINCT CAST(time AS DATE) AS unique_date
      FROM Communications
      ORDER BY unique_date DESC
      OFFSET 0 ROWS FETCH NEXT 3 ROWS ONLY;
    `;
      const dateResult = await pool.request().query(dateQuery);
      if (dateResult.recordset.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "No messages found." });
      }
      const topDates = dateResult.recordset.map((row) => row.unique_date);
      if (topDates.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "No messages found." });
      }
      const dateParams = topDates.map((_, index) => `@date${index}`).join(", ");
      const messageQuery = `
      SELECT * FROM Communications 
      WHERE CAST(time AS DATE) IN (${dateParams})
      AND username IS NOT NULL 
      AND regdNo IS NOT NULL
      ORDER BY time DESC;
    `;
      const request = pool.request();
      topDates.forEach((date, index) => {
        request.input(`date${index}`, date);
      });
      const messageResult = await request.query(messageQuery);
      if (messageResult.recordset.length > 0) {
        res
          .status(200)
          .json({ success: true, messages: messageResult.recordset });
      } else {
        res.status(404).json({ success: false, message: "No messages found." });
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
  selectedUsersPushNotifications: async (req, res) => {
    const { regdNos, title, body, data } = req.body;
    const pool = req.app.locals.sql;
    try {
      if (!Array.isArray(regdNos) || regdNos.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid regdNos array." });
      }
      const query = `SELECT pushToken FROM GSecurityMaster WHERE regdNo IN (${regdNos
        .map((_, i) => `@regdNo${i}`)
        .join(",")}) AND pushToken IS NOT NULL;`;
      const request = pool.request();
      regdNos.forEach((regdNo, i) => {
        request.input(`regdNo${i}`, regdNo);
      });
      const result = await request.query(query);
      if (result.recordset.length > 0) {
        const pushTokens = result.recordset.map((row) => row.pushToken);
        let messages = [];
        let tokenStatus = {};
        for (let pushToken of pushTokens) {
          if (!Expo.isExpoPushToken(pushToken)) {
            console.warn(
              `Push token ${pushToken} is not a valid Expo push token`
            );
            tokenStatus[pushToken] = 1;
            continue;
          }
          messages.push({
            to: pushToken,
            sound: "default",
            title,
            body,
            data: data || {},
          });
          tokenStatus[pushToken] = 1;
        }
        let chunks = expo.chunkPushNotifications(messages);
        let tickets = [];
        for (let chunk of chunks) {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        }
        tickets.forEach((ticket, index) => {
          if (ticket.status === "ok") {
            tokenStatus[messages[index].to] = 2;
          }
        });
        for (const pushToken of pushTokens) {
          try {
            await pool
              .request()
              .input("pushToken", sql.VarChar(sql.MAX), pushToken)
              .input("pushNotificationStatus", sql.Int, tokenStatus[pushToken])
              .query(`
                UPDATE GSecurityMaster 
                SET pushNotificationStatus = @pushNotificationStatus 
                WHERE pushToken = @pushToken
            `);
          } catch (dbError) {
            console.error(
              `Error updating pushNotificationStatus for ${pushToken}:`,
              dbError
            );
          }
        }
        res.json({ success: true, tickets });
      } else {
        res
          .status(404)
          .json({ success: false, message: "No push tokens found." });
      }
    } catch (error) {
      console.error("Error fetching push tokens:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
};
