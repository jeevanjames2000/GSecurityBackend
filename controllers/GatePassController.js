require("dotenv").config();
const sql = require("mssql");
const moment = require("moment");
module.exports = {
  getAllGatePass: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const gatePassResult = await pool
        .request()
        .query("SELECT * FROM CreateGatePass ORDER BY id DESC");
      const particularsResult = await pool
        .request()
        .query("SELECT * FROM gatepass_particulars");
      const gatePasses = gatePassResult.recordset;
      const particulars = particularsResult.recordset;
      const mappedData = gatePasses.map((gatePass) => {
        return {
          ...gatePass,
          particulars: particulars
            .filter((particular) => particular.pass_no === gatePass.pass_no)
            .map((particular) => ({
              id: particular.id,
              particular: particular.particular,
              qty: particular.qty,
            })),
        };
      });
      res.status(200).json(mappedData);
    } catch (err) {
      console.error("Error fetching gate pass data:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  getGatepassByID: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const { searchQuery } = req.query;

      if (!searchQuery || searchQuery.length === 0) {
        return res.status(400).json({ error: "Not a valid search" });
      }

      let query = "SELECT * FROM CreateGatePass";
      const conditions = [];
      if (searchQuery) {
        conditions.push(
          `(LOWER(pass_no) = LOWER('${searchQuery}') OR LOWER(vehicle_number) = LOWER('${searchQuery}'))`
        );
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY id DESC";
      const gatePassResult = await pool.request().query(query);

      if (gatePassResult.recordset.length === 0) {
        return res.status(404).json({ message: "No gate passes found." });
      }

      const filteredPassNos = gatePassResult.recordset.map(
        (pass) => pass.pass_no
      );

      const particularsResult = await pool
        .request()
        .query("SELECT * FROM gatepass_particulars");

      const gatePasses = gatePassResult.recordset;
      const particulars = particularsResult.recordset;

      const mappedData = gatePasses.map((gatePass) => {
        return {
          ...gatePass,
          particulars: particulars
            .filter((particular) => particular.pass_no === gatePass.pass_no)
            .map((particular) => ({
              id: particular.id,
              particular: particular.particular,
              qty: particular.qty,
            })),
        };
      });
      console.log("mappedData: ", mappedData);

      res.status(200).json(mappedData);
    } catch (err) {
      console.error("Error fetching gate pass data:", err);
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
      note,
      particulars,
    } = req.body;
    const pool = req.app.locals.sql;
    const transaction = pool.transaction();
    try {
      await transaction.begin();
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
      await transaction
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
        .input("note", sql.VarChar(sql.MAX), note)
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
          note,
          status
        ) 
        VALUES (
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
          @note,
          @status
        );
      `);
      const passIdQuery = await transaction
        .request()
        .input("pass_no", sql.VarChar(sql.MAX), pass_no).query(`
        SELECT id FROM CreateGatePass
        WHERE pass_no = @pass_no;
      `);
      const pass_id = passIdQuery.recordset[0].id;
      for (let i = 0; i < particulars.length; i++) {
        const { particular, qty } = particulars[i];
        await transaction
          .request()
          .input("pass_id", sql.Int, pass_id)
          .input("pass_no", sql.VarChar(sql.MAX), pass_no)
          .input("particular", sql.VarChar(sql.MAX), particular)
          .input("qty", sql.Int, qty).query(`
          INSERT INTO gatepass_particulars (
            pass_no,
            pass_id,
            particular,
            qty
          ) VALUES (
            @pass_no,
            @pass_id,
            @particular,
            @qty
          );
        `);
      }
      await transaction.commit();
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
      await transaction.rollback();
      console.error("Error creating gatepass:", error);
      return res.status(500).json({ error: "Error creating gatepass" });
    }
  },
  updateParticularQty: async (req, res) => {
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm");
    const { pass_no, particulars, status, verified_by } = req.body;
    const pool = req.app.locals.sql;
    const transaction = pool.transaction();
    try {
      await transaction.begin();
      const passQuery = await transaction
        .request()
        .input("pass_no", sql.VarChar(sql.MAX), pass_no).query(`
        SELECT id 
        FROM CreateGatePass 
        WHERE pass_no = @pass_no
      `);
      if (passQuery.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Pass not found" });
      }
      const pass_id = passQuery.recordset[0].id;
      const parsedParticulars =
        typeof particulars === "string" ? JSON.parse(particulars) : particulars;
      for (let i = 0; i < parsedParticulars.length; i++) {
        const { id, qty } = parsedParticulars[i];
        const verifiedQty = String(qty);
        await transaction
          .request()
          .input("id", sql.Int, id)
          .input("verified_qty", sql.VarChar(sql.MAX), verifiedQty)
          .input("verified_by", sql.VarChar(sql.MAX), verified_by)
          .input("updated_on", sql.DateTime, currentDateTime).query(`
          UPDATE gatepass_particulars
          SET 
            verified_qty = @verified_qty,
            updated_on = @updated_on,
            verified_by=@verified_by
          WHERE id = @id
        `);
      }
      await transaction
        .request()
        .input("status", sql.VarChar(sql.MAX), status)
        .input("verified_by", sql.VarChar(sql.MAX), verified_by)
        .input("pass_id", sql.Int, pass_id)
        .input("pass_no", sql.VarChar(sql.MAX), pass_no).query(`
        UPDATE CreateGatePass
        SET status = @status,verified_by=@verified_by
        WHERE id = @pass_id AND pass_no = @pass_no
      `);
      await transaction.commit();
      const message =
        status === "approved"
          ? "Pass approved successfully"
          : "Pass rejected successfully";
      return res.status(200).json({
        message,
        updatedDetails: {
          pass_no,
          status,
          particulars,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error updating particulars:", error);
      return res.status(500).json({ error: "Error updating particulars" });
    }
  },
};
