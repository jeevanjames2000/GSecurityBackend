const path = require("path");
const multer = require("multer");
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
const upload = multer({ storage });
module.exports = {
  getImaage: (req, res) => {
    const imageName = req.params.name;
    const imagePath = path.join(__dirname, "../assets", imageName);
    res.sendFile(imagePath, (err) => {
      if (err) {
        res.status(404).send({ error: "Image not found" });
      }
    });
  },
  uploadImage: (req, res) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        return res.status(500).send({ error: "Error uploading file" });
      }
      if (!req.file) {
        return res.status(400).send({ error: "No file uploaded" });
      }
      const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${
        req.file.filename
      }`;
      res.status(200).send({ message: "File uploaded successfully", fileUrl });
    });
  },
};
