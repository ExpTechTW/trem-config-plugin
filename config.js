const yaml = require("js-yaml");
const path = require("path");

class Config {
  static instance = {};

  constructor(name, logger, fs, defaultDir, configDir) {
    if (!name) throw new Error("Name not found!");
    if (Config.instance[name]) return Config.instance[name];

    this.logger = logger;
    this.fs = fs;

    this.default_config = {};
    this.config = {};

    this.defaultDir = defaultDir;
    this.configDir = configDir;

    this.checkConfigExists();
    this.readDefaultYaml();
    this.readConfigYaml();
    this.checkConfigVersion();

    Config.instance[name] = this;
  }

  resetConfig() {
    try {
      this.fs.copyFileSync(this.defaultDir, this.configDir);
      this.logger.info("Config has been reset to default");
      this.readConfigYaml();

      if (ipcRenderer) ipcRenderer.send("config-updated");
    } catch (error) {
      this.logger.error("Failed to reset config:", error);
    }
  }

  static getInstance(name) {
    if (!Config.instance[name]) new Config();
    return Config.instance[name];
  }

  checkConfigExists() {
    if (!this.fs.existsSync(this.configDir))
      this.fs.copySync(this.defaultDir, this.configDir);
  }

  readDefaultYaml() {
    const raw = this.fs.readFileSync(this.defaultDir).toString();
    this.default_config = yaml.load(raw);
  }

  readConfigYaml() {
    const raw = this.fs.readFileSync(this.configDir).toString();
    this.config = yaml.load(raw);
  }

  writeConfig(config = this.config) {
    this.logger.debug("Writing config:", JSON.stringify(config, null, 2));

    const lines = [];
    let configContent = this.fs.readFileSync(this.defaultDir, "utf8");
    const templateLines = configContent.split("\n");
    let currentKey = "";

    const escapeValue = (value) => {
      if (typeof value === 'string' && value.includes('@')) {
          return `'${value}'`;
      }
      return value;
    };

    for (const line of templateLines) {
      const keyMatch = line.match(/^(\w+):|^([\w-]+):/);
      const indentedKeyMatch = line.match(/^\s+(\w+):|^\s+([\w-]+):/);

      if (keyMatch) {
        currentKey = keyMatch[1] || keyMatch[2];
        const value = config[currentKey];
        this.logger.debug(`Processing key: ${currentKey}, value:`, value);

        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        )
          lines.push(`${currentKey}:`);
        else lines.push(`${currentKey}: ${escapeValue(value)}`);
      } else if (indentedKeyMatch && currentKey) {
        const subKey = indentedKeyMatch[1] || indentedKeyMatch[2];
        if (
          config[currentKey] &&
          typeof config[currentKey][subKey] !== "undefined"
        ) {
          const value = config[currentKey][subKey];
          const comment = line.includes("#") ? " #" + line.split("#")[1] : "";
          lines.push(`  ${subKey}: ${escapeValue(value)}${comment}`);
          this.logger.debug(
            `Processing subkey: ${currentKey}.${subKey}, value:`,
            value
          );
        }
      } else lines.push(line);
    }

    configContent = lines.join("\n");
    this.logger.debug("New content to write:", configContent);

    try {
      const dir = path.dirname(this.configDir);
      if (!this.fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      this.fs.writeFileSync(this.configDir, configContent, "utf8");
      this.logger.info("Config has been saved to file");
    } catch (error) {
      this.logger.error("Failed to write config:", error);
    }

    try {
      this.fs.writeFileSync(this.configDir, configContent, "utf8");
      this.logger.info("Config has been saved to file");

      // if (ipcRenderer) ipcRenderer.send("config-updated");
    } catch (error) {
      this.logger.error("Failed to write config:", error);
    }

    this.config = config;
  }

  checkConfigVersion() {
    if (this.default_config.ver > (this.config?.ver ?? 0)) {
      this.logger.warn(
        `Updating config from version ${this.config?.ver ?? 0} to ${
          this.default_config.ver
        }`
      );

      let configContent = this.fs.readFileSync(this.defaultDir, "utf8");
      const lines = configContent.split("\n");
      const newLines = [];
      let currentKey = "";

      const newConfig = JSON.parse(JSON.stringify(this.default_config));
      for (const key in this.config)
        if (this.config[key] !== null && this.config[key] !== undefined)
          if (
            typeof this.config[key] === "object" &&
            !Array.isArray(this.config[key])
          )
            newConfig[key] = {
              ...newConfig[key],
              ...this.config[key],
            };
          else newConfig[key] = this.config[key];

      newConfig.ver = this.default_config.ver;

      for (const line of lines) {
        const keyMatch = line.match(/^(\w+):|^([\w-]+):/);
        const indentedKeyMatch = line.match(/^\s+(\w+):|^\s+([\w-]+):/);

        if (keyMatch) {
          currentKey = keyMatch[1] || keyMatch[2];
          const value = newConfig[currentKey];

          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          )
            newLines.push(`${currentKey}:`);
          else newLines.push(`${currentKey}: ${value}`);
        } else if (indentedKeyMatch && currentKey) {
          const subKey = indentedKeyMatch[1] || indentedKeyMatch[2];
          if (
            newConfig[currentKey] &&
            typeof newConfig[currentKey][subKey] !== "undefined"
          ) {
            const value = newConfig[currentKey][subKey];
            const comment = line.includes("#") ? " #" + line.split("#")[1] : "";
            newLines.push(`  ${subKey}: ${value}${comment}`);
          }
        } else newLines.push(line);
      }

      configContent = newLines.join("\n");

      const backupPath = `${this.configDir}.backup`;
      this.fs.copyFileSync(this.configDir, backupPath);
      this.logger.info(`Backup created at: ${backupPath}`);

      this.fs.writeFileSync(this.configDir, configContent);
      this.logger.info("Config file updated successfully");

      this.config = newConfig;
    }
  }

  getConfig(refresh = false) {
    if (refresh) this.readConfigYaml();
    return this.config;
  }
}

module.exports = Config;
