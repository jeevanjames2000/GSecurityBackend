require("dotenv").config();
const sql = require("mssql");
const moment = require("moment");
module.exports = {
  getAllGatePass: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const result = await pool
        .request()
        .query("SELECT * FROM CreateGatePass ORDER BY id DESC");
      res.status(200).json(result.recordset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
  createGatePass: async (req, res) => {
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm");
    const {
      pass_type,
      issued_by,
      issued_to,
      issuer_mobile,
      campus,
      receiver_emp_id,
      receiver_type,
      receiver_name,
      receiver_mobile_number,
      vehicle_number,
      remarks,
      particulars,
    } = req.body;
    const particularsJson = JSON.stringify(particulars);
    try {
      const pool = req.app.locals.sql;
      const lastPassQuery = await pool
        .request()
        .query("SELECT pass_no FROM CreateGatePass ORDER BY id DESC");
      let pass_no = "20250001";
      if (lastPassQuery.recordset.length > 0) {
        const lastPassNo = lastPassQuery.recordset[0].pass_no;

        const lastPassNoNumeric = parseInt(lastPassNo.slice(4), 10);
        const incrementedPassNo = lastPassNoNumeric + 1;
        pass_no = `2025${String(incrementedPassNo).padStart(4, "0")}`;
      }
      await pool
        .request()
        .input("pass_type", sql.VarChar(sql.MAX), pass_type)
        .input("pass_no", sql.VarChar(sql.MAX), pass_no)
        .input("created_time", sql.DateTime, currentDateTime)
        .input("issued_by", sql.VarChar(sql.MAX), issued_by)
        .input("issued_to", sql.VarChar(sql.MAX), issued_to)
        .input("issuer_mobile", sql.VarChar(sql.MAX), issuer_mobile)
        .input("campus", sql.VarChar(sql.MAX), campus)
        .input("receiver_emp_id", sql.VarChar(sql.MAX), receiver_emp_id)
        .input("receiver_type", sql.VarChar(sql.MAX), receiver_type)
        .input("receiver_name", sql.VarChar(sql.MAX), receiver_name)
        .input(
          "receiver_mobile_number",
          sql.VarChar(sql.MAX),
          receiver_mobile_number
        )
        .input("vehicle_number", sql.VarChar(sql.MAX), vehicle_number)
        .input("remarks", sql.VarChar(sql.MAX), remarks)
        .input("particulars", sql.VarChar(sql.MAX), particularsJson)
        .input("status", sql.VarChar(sql.MAX), "pending").query(`
        INSERT INTO CreateGatePass (
          pass_type,
          pass_no,
          created_time,
          issued_by,
          issued_to,
          issuer_mobile,
          campus,
          receiver_emp_id,
          receiver_type,
          receiver_name,
          receiver_mobile_number,
          vehicle_number,
          remarks,
          particulars,
          status
        ) VALUES (
          @pass_type,
          @pass_no,
          @created_time,
          @issued_by,
          @issued_to,
          @issuer_mobile,
          @campus,
          @receiver_emp_id,
          @receiver_type,
          @receiver_name,
          @receiver_mobile_number,
          @vehicle_number,
          @remarks,
          @particulars, 
          @status
        );
      `);
      return res.status(200).json({
        message: "Gate pass created successfully",
        gatePassDetails: {
          pass_no,
          pass_type,
          issued_by,
          issued_to,
        },
      });
    } catch (error) {
      console.error("Error creating gatepass:", error);
      return res.status(500).json({ error: "Error creating gatepass" });
    }
  },
  updateParticularQty: async (req, res) => {
    const { pass_no, particulars, status } = req.body;

    try {
      const pool = req.app.locals.sql;
      const result = await pool
        .request()
        .input("pass_no", sql.VarChar(sql.MAX), pass_no)
        .query(
          "SELECT particulars FROM CreateGatePass WHERE pass_no = @pass_no"
        );
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: "Pass not found" });
      }
      const currentParticulars = JSON.parse(result.recordset[0].particulars);
      const updatedParticulars =
        typeof particulars === "string" ? JSON.parse(particulars) : particulars;
      updatedParticulars.forEach((updatedItem) => {
        const index = currentParticulars.findIndex(
          (item) => item.particular === updatedItem.particular
        );
        if (index !== -1) {
          currentParticulars[index].qty = updatedItem.qty;
        }
      });
      const updatedParticularsString = JSON.stringify(currentParticulars);
      await pool
        .request()
        .input("particulars", sql.VarChar(sql.MAX), updatedParticularsString)
        .input("pass_no", sql.VarChar(sql.MAX), pass_no)
        .input("status", sql.VarChar(sql.MAX), status)
        .query(
          "UPDATE CreateGatePass SET particulars = @particulars, status = @status WHERE pass_no = @pass_no"
        );
      const message =
        status === "approved"
          ? "Pass approved successfully"
          : "Pass rejected successfully";
      return res.status(200).json({
        message,
        updatedParticulars: currentParticulars,
      });
    } catch (error) {
      console.error("Error updating particulars:", error);
      return res.status(500).json({ error: "Error updating particulars" });
    }
  },
};
