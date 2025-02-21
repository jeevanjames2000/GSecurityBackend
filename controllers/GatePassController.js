require("dotenv").config();
const sql = require("mssql");
const moment = require("moment");
module.exports = {
  getAllGatePass: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const result = await pool.request().query(`
      SELECT gp.*, gp_part.id AS particular_id, gp_part.particular, gp_part.qty
      FROM CreateGatePass gp
      LEFT JOIN gatepass_particulars gp_part ON gp.pass_no = gp_part.pass_no
      ORDER BY gp.id DESC
    `);
      const groupedData = result.recordset.reduce((acc, row) => {
        if (!acc[row.pass_no]) {
          acc[row.pass_no] = {
            ...row,
            particulars: [],
          };
        }
        if (row.particular_id) {
          acc[row.pass_no].particulars.push({
            id: row.particular_id,
            particular: row.particular,
            qty: row.qty,
          });
        }
        return acc;
      }, {});
      res.status(200).json(Object.values(groupedData));
    } catch (err) {
      console.error("Error fetching gate pass data:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  getGatepassByID: async (req, res) => {
    try {
      const pool = req.app.locals.sql;
      const { searchQuery } = req.query;
      if (!searchQuery || searchQuery.trim().length === 0) {
        return res.status(400).json({ error: "Not a valid search" });
      }
      const query = `
      SELECT gp.*, gp_part.id AS particular_id, gp_part.particular, gp_part.qty
      FROM CreateGatePass gp
      LEFT JOIN gatepass_particulars gp_part ON gp.pass_no = gp_part.pass_no
      WHERE LOWER(gp.pass_no) = LOWER(@searchQuery) OR LOWER(gp.vehicle_number) = LOWER(@searchQuery)
      ORDER BY gp.id DESC
    `;
      const result = await pool
        .request()
        .input("searchQuery", sql.VarChar, searchQuery)
        .query(query);
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "No gate passes found." });
      }
      const groupedData = result.recordset.reduce((acc, row) => {
        if (!acc[row.pass_no]) {
          acc[row.pass_no] = {
            ...row,
            particulars: [],
          };
        }
        if (row.particular_id) {
          acc[row.pass_no].particulars.push({
            id: row.particular_id,
            particular: row.particular,
            qty: row.qty,
          });
        }
        return acc;
      }, {});
      res.status(200).json(Object.values(groupedData));
    } catch (err) {
      console.error("Error fetching gate pass data:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  createGatePass: async (req, res) => {
    const currentDateTime = moment().format("YYYY-MM-DD");
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
        .query("SELECT TOP 1 pass_no FROM CreateGatePass ORDER BY id DESC");
      let pass_no = "20250001";
      if (lastPassQuery.recordset.length > 0) {
        const lastPassNo = lastPassQuery.recordset[0].pass_no;
        const lastPassNoNumeric = parseInt(lastPassNo.slice(4), 10);
        pass_no = `2025${String(lastPassNoNumeric + 1).padStart(4, "0")}`;
      }
      const insertGatePass = await transaction
        .request()
        .input("pass_type", sql.VarChar, pass_type)
        .input("pass_no", sql.VarChar, pass_no)
        .input("created_time", sql.DateTime, currentDateTime)
        .input("issued_by", sql.VarChar, issued_by)
        .input("issued_to", sql.VarChar, issued_to)
        .input("issuer_mobile", sql.VarChar, issuer_mobile)
        .input("campus", sql.VarChar, campus)
        .input("receiver_emp_id", sql.VarChar, receiver_emp_id)
        .input("receiver_type", sql.VarChar, receiver_type)
        .input("receiver_name", sql.VarChar, receiver_name)
        .input("receiver_mobile_number", sql.VarChar, receiver_mobile_number)
        .input("vehicle_number", sql.VarChar, vehicle_number)
        .input("note", sql.VarChar, note)
        .input("status", sql.VarChar, "pending").query(`
        INSERT INTO CreateGatePass (
          pass_type, pass_no, created_time, issued_by, issued_to,
          issuer_mobile, campus, receiver_emp_id, receiver_type,
          receiver_name, receiver_mobile_number, vehicle_number, note, status
        ) 
        OUTPUT INSERTED.id, INSERTED.pass_no
        VALUES (
          @pass_type, @pass_no, @created_time, @issued_by, @issued_to,
          @issuer_mobile, @campus, @receiver_emp_id, @receiver_type,
          @receiver_name, @receiver_mobile_number, @vehicle_number, @note, @status
        );
      `);
      const { id: pass_id } = insertGatePass.recordset[0];
      if (particulars.length > 0) {
        const values = particulars
          .map((_, i) => `(@pass_no, @pass_id, @particular${i}, @qty${i})`)
          .join(", ");
        const particularsRequest = transaction
          .request()
          .input("pass_no", sql.VarChar, pass_no)
          .input("pass_id", sql.Int, pass_id);
        particulars.forEach(({ particular, qty }, i) => {
          particularsRequest.input(`particular${i}`, sql.VarChar, particular);
          particularsRequest.input(`qty${i}`, sql.Int, qty);
        });
        await particularsRequest.query(`
        INSERT INTO gatepass_particulars (pass_no, pass_id, particular, qty)
        VALUES ${values};
      `);
      }
      await transaction.commit();
      return res.status(200).json({
        message: "Gate pass created successfully",
        gatePassDetails: { pass_no, pass_type, issued_by, issued_to },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error creating gate pass:", error);
      return res.status(500).json({ error: "Error creating gate pass" });
    }
  },
  updateParticularQty: async (req, res) => {
    const currentDateTime = moment().format("YYYY-MM-DD");
    const { pass_no, particulars, status, verified_by } = req.body;
    const pool = req.app.locals.sql;
    const transaction = pool.transaction();
    try {
      await transaction.begin();
      const passQuery = await transaction
        .request()
        .input("pass_no", sql.VarChar, pass_no)
        .query(`SELECT id FROM CreateGatePass WHERE pass_no = @pass_no`);
      if (passQuery.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Pass not found" });
      }
      const pass_id = passQuery.recordset[0].id;
      const parsedParticulars =
        typeof particulars === "string" ? JSON.parse(particulars) : particulars;
      if (parsedParticulars.length > 0) {
        const updateParticularsQuery = `
        UPDATE gatepass_particulars
        SET 
          verified_qty = CASE id 
            ${parsedParticulars
              .map(({ id, qty }) => `WHEN ${id} THEN '${qty}'`)
              .join(" ")}
          END,
          updated_on = @updated_on,
          verified_by = @verified_by
        WHERE id IN (${parsedParticulars.map(({ id }) => id).join(", ")})
      `;
        await transaction
          .request()
          .input("verified_by", sql.VarChar, verified_by)
          .input("updated_on", sql.DateTime, currentDateTime)
          .query(updateParticularsQuery);
      }
      await transaction
        .request()
        .input("status", sql.VarChar, status)
        .input("verified_by", sql.VarChar, verified_by)
        .input("pass_id", sql.Int, pass_id)
        .input("pass_no", sql.VarChar, pass_no).query(`
        UPDATE CreateGatePass
        SET status = @status, verified_by = @verified_by
        WHERE id = @pass_id AND pass_no = @pass_no
      `);
      await transaction.commit();
      const message =
        status === "approved"
          ? "Pass approved successfully"
          : "Pass rejected successfully";
      return res.status(200).json({
        message,
        updatedDetails: { pass_no, status, particulars },
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Error updating particulars:", error);
      return res.status(500).json({ error: "Error updating particulars" });
    }
  },
};
