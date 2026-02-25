const { version } = require("./package.json");

// Extends app.json with dynamic values. Version is sourced from package.json.
module.exports = ({ config }) => ({
  ...config,
  version,
});
