// Vercel serverless function entry point
// Re-exports the Express app from server.js
const app = require('../server.js');
module.exports = app;
