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
      const { name, vehicle_number, comments, totalFines, violationType } =
        req.body;
      if (
        !name ||
        !vehicle_number ||
        !comments ||
        !totalFines ||
        !violationType
      ) {
        return res
          .status(400)
          .json({ error: "Please enter all the required fields" });
      }
      const violation_type = Array.isArray(violationType)
        ? violationType
        : [violationType];
      const pics = req.files
        ? req.files.map(
            (file) =>
              `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
          )
        : [];
      try {
        const pool = req.app.locals.sql;
        await pool
          .request()
          .input("name", sql.VarChar(sql.MAX), name)
          .input("vehicle_number", sql.VarChar(sql.MAX), vehicle_number)
          .input(
            "violation_type",
            sql.VarChar(sql.MAX),
            violation_type.join(",")
          )
          .input("comments", sql.VarChar(sql.MAX), comments)
          .input("totalFines", sql.VarChar(sql.Int), totalFines)
          .input("pics", sql.VarChar(sql.MAX), pics.join(",")).query(`
          INSERT INTO ReportViolations (name,vehicle_number, violation_type, comments,totalFines, pics)
          VALUES (@name,@vehicle_number, @violation_type, @comments,@totalFines, @pics);
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

      if (!searchQuery || searchQuery.length === 0) {
        return res.status(400).json({ error: "Invalid search query." });
      }

      if (searchQuery.startsWith("G")) {
        // Search in CreateGatePass
        const gatePassQuery = `
        SELECT * FROM CreateGatePass 
        WHERE LOWER(pass_no) = LOWER(@searchQuery) 
           OR LOWER(vehicle_number) = LOWER(@searchQuery)
      `;
        const gatePassResult = await pool
          .request()
          .input("searchQuery", searchQuery)
          .query(gatePassQuery);

        if (gatePassResult.recordset.length > 0) {
          const particularsResult = await pool
            .request()
            .query("SELECT * FROM gatepass_particulars");

          const gatePasses = gatePassResult.recordset;
          const particulars = particularsResult.recordset;

          const mappedData = gatePasses.map((gatePass) => ({
            ...gatePass,
            particulars: particulars
              .filter((particular) => particular.pass_no === gatePass.pass_no)
              .map((particular) => ({
                id: particular.id,
                particular: particular.particular,
                qty: particular.qty,
              })),
          }));

          return res.status(200).json({ source: "GatePass", data: mappedData });
        }
      } else if (searchQuery.startsWith("V")) {
        // Search in visitor_management
        const visitorsQuery = `
        SELECT * FROM visitor_management 
        WHERE LOWER(visitor_id) = LOWER(@searchQuery)
      `;
        const visitorsResult = await pool
          .request()
          .input("searchQuery", searchQuery)
          .query(visitorsQuery);

        if (visitorsResult.recordset.length > 0) {
          return res.status(200).json({
            source: "VisitorManagement",
            data: visitorsResult.recordset,
          });
        }
      } else {
        // Search in ReportViolations
        const violationsQuery = `
        SELECT * FROM ReportViolations 
        WHERE LOWER(vehicle_number) = LOWER(@searchQuery) 
        OR LOWER(regdNo_empId) = LOWER(@regdNo_empId) OR LOWER(name) LIKE LOWER('%' + @searchQuery + '%') 
      `;
        const violationsResult = await pool
          .request()
          .input("searchQuery", searchQuery)
          .input("regdNo_empId", sql.VarChar(sql.MAX), searchQuery)
          .query(violationsQuery);

        if (violationsResult.recordset.length > 0) {
          return res
            .status(200)
            .json({ source: "Violations", data: violationsResult.recordset });
        }
      }

      return res
        .status(404)
        .json({ message: "No data found in any database." });
    } catch (err) {
      console.error("Error searching databases:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
};
