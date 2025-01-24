require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sql = require("mssql");
const app = express();
const path = require("path");

app.use(
  cors({
    origin: "*",
  })
);

const sqlConfig = {
  user: "sa",
  password: "SQL@UAT123!@#",
  server: "192.168.64.36",
  database: "GSecurity",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};
sql
  .connect(sqlConfig)
  .then((pool) => {
    if (pool.connected) {
      console.log("SQL Server connected");
    }
    app.locals.sql = pool;
  })
  .catch((err) => {
    console.error("Error connecting to SQL Server:", err.message);
  });

app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "./uploads")));
app.use("/auth", require("./routes/mainRoutes"));
app.use("/gatepass", require("./routes/gatepassRoutes"));
app.use("/api/global", require("./routes/globalRoutes"));

const PORT = 9000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
