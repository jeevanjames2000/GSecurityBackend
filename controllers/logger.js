const fs = require("fs");
const path = require("path");
const sql = require("mssql");
const ErrorLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, "error.log");

const Logger = async (req, res, next) => {
  const {
    errorLevel,
    errorMessage,
    errorType,
    totalActiveUsers,
    errorLocation,
    deviceType,
  } = req.body;
  if (![errorLevel, errorMessage, errorType].every(Boolean)) {
    return res
      .status(400)
      .json({ error: "Please enter all the required fields" });
  }
  try {
    const pool = req.app.locals.sql;
    await pool
      .request()
      .input("errorType", sql.VarChar(sql.MAX), errorType)
      .input("errorLevel", sql.VarChar(sql.MAX), errorLevel)
      .input("errorLocation", sql.VarChar(sql.MAX), errorLocation)
      .input("errorMessage", sql.VarChar(sql.MAX), errorMessage)
      .input("totalActiveUsers", sql.Int, totalActiveUsers)
      .input("deviceType", sql.VarChar(sql.MAX), JSON.stringify(deviceType))
      .query(`
        INSERT INTO GLogger (errorType, errorLevel, errorLocation, errorMessage, totalActiveUsers, deviceType)
        VALUES (@errorType, @errorLevel, @errorLocation, @errorMessage, @totalActiveUsers, @deviceType);
      `);
    const logEntry = `${new Date().toISOString()} | ${errorLevel.toUpperCase()} | ${errorType} | ${errorLocation} | ${deviceType} | ${errorMessage}\n`;
    fs.appendFileSync(logFilePath, logEntry, "utf8");
    return res.status(200).json({
      message: "Error Logged Successfully",
      log: {
        errorType,
        errorLevel,
        errorLocation,
        errorMessage,
        totalActiveUsers,
        deviceType,
      },
    });
  } catch (error) {
    next(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
module.exports = Logger;
