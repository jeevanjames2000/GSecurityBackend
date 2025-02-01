require("dotenv").config();
const sql = require("mssql");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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
  limits: { files: 5 },
}).array("images[]", 5);
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
      if (
        ![name, vehicle_number, comments, totalFines, violationType].every(
          Boolean
        )
      ) {
        return res
          .status(400)
          .json({ error: "Please enter all the required fields" });
      }
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
          .input("pics", sql.VarChar, pics.join(",")).query(`
          INSERT INTO ReportViolations (name, vehicle_number, violation_type, comments, totalFines, pics, regdNo_empId, reported_by)
          VALUES (@name, @vehicle_number, @violation_type, @comments, @totalFines, @pics, @regdNo_empId, @reported_by);
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
      }
      if (normalizedQuery.startsWith("vm")) {
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
      const pass_id = passQuery.recordset[0].id;
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
      console.log("error: ", error);
      await transaction.rollback();
      return res.status(500).json({ error: "Error updating " });
    }
  },
};
