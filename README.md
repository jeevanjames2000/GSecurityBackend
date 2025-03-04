# GSecurityBackend

1. Folder Structure

   /GSecurityBackend
   │── /assets # Static assets
   │── /controllers # Controllers for handling requests
   │ │── AssetController.js # Handles asset-related requests
   │ │── AuthController.js # Authentication and authorization logic
   │ │── GatepassController.js # Manages gate pass-related logic
   │ │── Logger.js # Logs request data
   │ │── MainController.js # Main entry controller
   │── /logs # Application logs
   │── /middleware # Middleware functions
   │ │── auth.js # JWT authentication middleware
   │── /routes # Route definitions
   │ │── gatepassroutes.js # Routes for gate pass operations
   │ │── globalroutes.js # Global application routes
   │ │── mainRoutes.js # Main feature routes
   │── /uploads # Directory for storing uploaded images
   │── index.js # Entry point for backend server
   │── package.json # Backend dependencies and scripts

2. Deployment

npm install
npm run dev

in production

login to linux server 169
username : gusports
password: ""

route to /var/www/html/GSecurityBackend

npm install
npm run dev or pm2 start index.js
now directly connect the ip address of linux server and call the apis instead of your localhost ip

3. Installation
   use npm packages npm install "package name"
   "dependencies": {
   "bcrypt": "^5.1.1",
   "body-parser": "^1.20.3",
   "cors": "^2.8.5",
   "dotenv": "^16.4.7",
   "expo-server-sdk": "^3.13.0",
   "express": "^4.21.2",
   "jsonwebtoken": "^9.0.2",
   "moment": "^2.30.1",
   "mssql": "^11.0.1",
   "multer": "^1.4.5-lts.1",
   "nodemon": "^3.1.9",
   "sequelize": "^6.37.5"
   }
