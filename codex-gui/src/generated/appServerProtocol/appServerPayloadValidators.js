// GENERATED CODE! DO NOT MODIFY BY HAND!
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// scripts/protocolValidators/standaloneValidators.raw.js
var validateInitializeResponse = validate10;
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.codexHome === void 0 && (missing0 = "codexHome") || data.platformFamily === void 0 && (missing0 = "platformFamily") || data.platformOs === void 0 && (missing0 = "platformOs") || data.userAgent === void 0 && (missing0 = "userAgent")) {
        validate12.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.codexHome !== void 0) {
          const _errs1 = errors;
          if (typeof data.codexHome !== "string") {
            validate12.errors = [{ instancePath: instancePath + "/codexHome", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.platformFamily !== void 0) {
            const _errs5 = errors;
            if (typeof data.platformFamily !== "string") {
              validate12.errors = [{ instancePath: instancePath + "/platformFamily", schemaPath: "#/properties/platformFamily/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs5 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.platformOs !== void 0) {
              const _errs7 = errors;
              if (typeof data.platformOs !== "string") {
                validate12.errors = [{ instancePath: instancePath + "/platformOs", schemaPath: "#/properties/platformOs/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs7 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.userAgent !== void 0) {
                const _errs9 = errors;
                if (typeof data.userAgent !== "string") {
                  validate12.errors = [{ instancePath: instancePath + "/userAgent", schemaPath: "#/properties/userAgent/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs9 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate12.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate12.errors = vErrors;
  return errors === 0;
}
function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate12(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
    errors = vErrors.length;
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var validateV2SkillsChangedNotification = validate14;
function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    validate14.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/SkillsChangedNotification/type", keyword: "type", params: { type: "object" } }];
    return false;
  }
  validate14.errors = vErrors;
  return errors === 0;
}
var validateV2SkillsListResponse = validate15;
var schema21 = { "properties": { "dependencies": { "anyOf": [{ "$ref": "#/definitions/v2/SkillDependencies" }, { "type": "null" }] }, "description": { "type": "string" }, "enabled": { "type": "boolean" }, "interface": { "anyOf": [{ "$ref": "#/definitions/v2/SkillInterface" }, { "type": "null" }] }, "name": { "type": "string" }, "path": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "scope": { "$ref": "#/definitions/v2/SkillScope" }, "shortDescription": { "description": "Legacy short_description from SKILL.md. Prefer SKILL.json interface.short_description.", "type": ["string", "null"] } }, "required": ["description", "enabled", "name", "path", "scope"], "type": "object" };
var schema28 = { "enum": ["user", "repo", "system", "admin"], "type": "string" };
var schema23 = { "properties": { "command": { "type": ["string", "null"] }, "description": { "type": ["string", "null"] }, "transport": { "type": ["string", "null"] }, "type": { "type": "string" }, "url": { "type": ["string", "null"] }, "value": { "type": "string" } }, "required": ["type", "value"], "type": "object" };
function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.tools === void 0 && (missing0 = "tools")) {
        validate19.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.tools !== void 0) {
          let data0 = data.tools;
          const _errs1 = errors;
          if (errors === _errs1) {
            if (Array.isArray(data0)) {
              var valid1 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                let data1 = data0[i0];
                const _errs3 = errors;
                const _errs4 = errors;
                if (errors === _errs4) {
                  if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                    let missing1;
                    if (data1.type === void 0 && (missing1 = "type") || data1.value === void 0 && (missing1 = "value")) {
                      validate19.errors = [{ instancePath: instancePath + "/tools/" + i0, schemaPath: "#/definitions/v2/SkillToolDependency/required", keyword: "required", params: { missingProperty: missing1 } }];
                      return false;
                    } else {
                      if (data1.command !== void 0) {
                        let data2 = data1.command;
                        const _errs6 = errors;
                        if (typeof data2 !== "string" && data2 !== null) {
                          validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/command", schemaPath: "#/definitions/v2/SkillToolDependency/properties/command/type", keyword: "type", params: { type: schema23.properties.command.type } }];
                          return false;
                        }
                        var valid3 = _errs6 === errors;
                      } else {
                        var valid3 = true;
                      }
                      if (valid3) {
                        if (data1.description !== void 0) {
                          let data3 = data1.description;
                          const _errs8 = errors;
                          if (typeof data3 !== "string" && data3 !== null) {
                            validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/description", schemaPath: "#/definitions/v2/SkillToolDependency/properties/description/type", keyword: "type", params: { type: schema23.properties.description.type } }];
                            return false;
                          }
                          var valid3 = _errs8 === errors;
                        } else {
                          var valid3 = true;
                        }
                        if (valid3) {
                          if (data1.transport !== void 0) {
                            let data4 = data1.transport;
                            const _errs10 = errors;
                            if (typeof data4 !== "string" && data4 !== null) {
                              validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/transport", schemaPath: "#/definitions/v2/SkillToolDependency/properties/transport/type", keyword: "type", params: { type: schema23.properties.transport.type } }];
                              return false;
                            }
                            var valid3 = _errs10 === errors;
                          } else {
                            var valid3 = true;
                          }
                          if (valid3) {
                            if (data1.type !== void 0) {
                              const _errs12 = errors;
                              if (typeof data1.type !== "string") {
                                validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/type", schemaPath: "#/definitions/v2/SkillToolDependency/properties/type/type", keyword: "type", params: { type: "string" } }];
                                return false;
                              }
                              var valid3 = _errs12 === errors;
                            } else {
                              var valid3 = true;
                            }
                            if (valid3) {
                              if (data1.url !== void 0) {
                                let data6 = data1.url;
                                const _errs14 = errors;
                                if (typeof data6 !== "string" && data6 !== null) {
                                  validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/url", schemaPath: "#/definitions/v2/SkillToolDependency/properties/url/type", keyword: "type", params: { type: schema23.properties.url.type } }];
                                  return false;
                                }
                                var valid3 = _errs14 === errors;
                              } else {
                                var valid3 = true;
                              }
                              if (valid3) {
                                if (data1.value !== void 0) {
                                  const _errs16 = errors;
                                  if (typeof data1.value !== "string") {
                                    validate19.errors = [{ instancePath: instancePath + "/tools/" + i0 + "/value", schemaPath: "#/definitions/v2/SkillToolDependency/properties/value/type", keyword: "type", params: { type: "string" } }];
                                    return false;
                                  }
                                  var valid3 = _errs16 === errors;
                                } else {
                                  var valid3 = true;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  } else {
                    validate19.errors = [{ instancePath: instancePath + "/tools/" + i0, schemaPath: "#/definitions/v2/SkillToolDependency/type", keyword: "type", params: { type: "object" } }];
                    return false;
                  }
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate19.errors = [{ instancePath: instancePath + "/tools", schemaPath: "#/properties/tools/type", keyword: "type", params: { type: "array" } }];
              return false;
            }
          }
        }
      }
    } else {
      validate19.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate19.errors = vErrors;
  return errors === 0;
}
var schema24 = { "properties": { "brandColor": { "type": ["string", "null"] }, "defaultPrompt": { "type": ["string", "null"] }, "displayName": { "type": ["string", "null"] }, "iconLarge": { "anyOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }, { "type": "null" }] }, "iconLargeUrl": { "description": "Remote large icon URL from the plugin catalog.", "type": ["string", "null"] }, "iconSmall": { "anyOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }, { "type": "null" }] }, "iconSmallUrl": { "description": "Remote small icon URL from the plugin catalog.", "type": ["string", "null"] }, "shortDescription": { "type": ["string", "null"] } }, "type": "object" };
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.brandColor !== void 0) {
        let data0 = data.brandColor;
        const _errs1 = errors;
        if (typeof data0 !== "string" && data0 !== null) {
          validate21.errors = [{ instancePath: instancePath + "/brandColor", schemaPath: "#/properties/brandColor/type", keyword: "type", params: { type: schema24.properties.brandColor.type } }];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.defaultPrompt !== void 0) {
          let data1 = data.defaultPrompt;
          const _errs3 = errors;
          if (typeof data1 !== "string" && data1 !== null) {
            validate21.errors = [{ instancePath: instancePath + "/defaultPrompt", schemaPath: "#/properties/defaultPrompt/type", keyword: "type", params: { type: schema24.properties.defaultPrompt.type } }];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.displayName !== void 0) {
            let data2 = data.displayName;
            const _errs5 = errors;
            if (typeof data2 !== "string" && data2 !== null) {
              validate21.errors = [{ instancePath: instancePath + "/displayName", schemaPath: "#/properties/displayName/type", keyword: "type", params: { type: schema24.properties.displayName.type } }];
              return false;
            }
            var valid0 = _errs5 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.iconLarge !== void 0) {
              let data3 = data.iconLarge;
              const _errs7 = errors;
              const _errs8 = errors;
              let valid1 = false;
              const _errs9 = errors;
              if (typeof data3 !== "string") {
                const err0 = { instancePath: instancePath + "/iconLarge", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err0];
                } else {
                  vErrors.push(err0);
                }
                errors++;
              }
              var _valid0 = _errs9 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs12 = errors;
                if (data3 !== null) {
                  const err1 = { instancePath: instancePath + "/iconLarge", schemaPath: "#/properties/iconLarge/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err1];
                  } else {
                    vErrors.push(err1);
                  }
                  errors++;
                }
                var _valid0 = _errs12 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err2 = { instancePath: instancePath + "/iconLarge", schemaPath: "#/properties/iconLarge/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
                validate21.errors = vErrors;
                return false;
              } else {
                errors = _errs8;
                if (vErrors !== null) {
                  if (_errs8) {
                    vErrors.length = _errs8;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs7 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.iconLargeUrl !== void 0) {
                let data4 = data.iconLargeUrl;
                const _errs14 = errors;
                if (typeof data4 !== "string" && data4 !== null) {
                  validate21.errors = [{ instancePath: instancePath + "/iconLargeUrl", schemaPath: "#/properties/iconLargeUrl/type", keyword: "type", params: { type: schema24.properties.iconLargeUrl.type } }];
                  return false;
                }
                var valid0 = _errs14 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.iconSmall !== void 0) {
                  let data5 = data.iconSmall;
                  const _errs16 = errors;
                  const _errs17 = errors;
                  let valid3 = false;
                  const _errs18 = errors;
                  if (typeof data5 !== "string") {
                    const err3 = { instancePath: instancePath + "/iconSmall", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err3];
                    } else {
                      vErrors.push(err3);
                    }
                    errors++;
                  }
                  var _valid1 = _errs18 === errors;
                  valid3 = valid3 || _valid1;
                  if (!valid3) {
                    const _errs21 = errors;
                    if (data5 !== null) {
                      const err4 = { instancePath: instancePath + "/iconSmall", schemaPath: "#/properties/iconSmall/anyOf/1/type", keyword: "type", params: { type: "null" } };
                      if (vErrors === null) {
                        vErrors = [err4];
                      } else {
                        vErrors.push(err4);
                      }
                      errors++;
                    }
                    var _valid1 = _errs21 === errors;
                    valid3 = valid3 || _valid1;
                  }
                  if (!valid3) {
                    const err5 = { instancePath: instancePath + "/iconSmall", schemaPath: "#/properties/iconSmall/anyOf", keyword: "anyOf", params: {} };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                    validate21.errors = vErrors;
                    return false;
                  } else {
                    errors = _errs17;
                    if (vErrors !== null) {
                      if (_errs17) {
                        vErrors.length = _errs17;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                  var valid0 = _errs16 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.iconSmallUrl !== void 0) {
                    let data6 = data.iconSmallUrl;
                    const _errs23 = errors;
                    if (typeof data6 !== "string" && data6 !== null) {
                      validate21.errors = [{ instancePath: instancePath + "/iconSmallUrl", schemaPath: "#/properties/iconSmallUrl/type", keyword: "type", params: { type: schema24.properties.iconSmallUrl.type } }];
                      return false;
                    }
                    var valid0 = _errs23 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.shortDescription !== void 0) {
                      let data7 = data.shortDescription;
                      const _errs25 = errors;
                      if (typeof data7 !== "string" && data7 !== null) {
                        validate21.errors = [{ instancePath: instancePath + "/shortDescription", schemaPath: "#/properties/shortDescription/type", keyword: "type", params: { type: schema24.properties.shortDescription.type } }];
                        return false;
                      }
                      var valid0 = _errs25 === errors;
                    } else {
                      var valid0 = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate21.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate21.errors = vErrors;
  return errors === 0;
}
function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.description === void 0 && (missing0 = "description") || data.enabled === void 0 && (missing0 = "enabled") || data.name === void 0 && (missing0 = "name") || data.path === void 0 && (missing0 = "path") || data.scope === void 0 && (missing0 = "scope")) {
        validate18.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.dependencies !== void 0) {
          let data0 = data.dependencies;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (!validate19(data0, { instancePath: instancePath + "/dependencies", parentData: data, parentDataProperty: "dependencies", rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = { instancePath: instancePath + "/dependencies", schemaPath: "#/properties/dependencies/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs4 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err1 = { instancePath: instancePath + "/dependencies", schemaPath: "#/properties/dependencies/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate18.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.description !== void 0) {
            const _errs6 = errors;
            if (typeof data.description !== "string") {
              validate18.errors = [{ instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.enabled !== void 0) {
              const _errs8 = errors;
              if (typeof data.enabled !== "boolean") {
                validate18.errors = [{ instancePath: instancePath + "/enabled", schemaPath: "#/properties/enabled/type", keyword: "type", params: { type: "boolean" } }];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.interface !== void 0) {
                let data3 = data.interface;
                const _errs10 = errors;
                const _errs11 = errors;
                let valid2 = false;
                const _errs12 = errors;
                if (!validate21(data3, { instancePath: instancePath + "/interface", parentData: data, parentDataProperty: "interface", rootData })) {
                  vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
                  errors = vErrors.length;
                }
                var _valid1 = _errs12 === errors;
                valid2 = valid2 || _valid1;
                if (!valid2) {
                  const _errs13 = errors;
                  if (data3 !== null) {
                    const err2 = { instancePath: instancePath + "/interface", schemaPath: "#/properties/interface/anyOf/1/type", keyword: "type", params: { type: "null" } };
                    if (vErrors === null) {
                      vErrors = [err2];
                    } else {
                      vErrors.push(err2);
                    }
                    errors++;
                  }
                  var _valid1 = _errs13 === errors;
                  valid2 = valid2 || _valid1;
                }
                if (!valid2) {
                  const err3 = { instancePath: instancePath + "/interface", schemaPath: "#/properties/interface/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                  validate18.errors = vErrors;
                  return false;
                } else {
                  errors = _errs11;
                  if (vErrors !== null) {
                    if (_errs11) {
                      vErrors.length = _errs11;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var valid0 = _errs10 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.name !== void 0) {
                  const _errs15 = errors;
                  if (typeof data.name !== "string") {
                    validate18.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid0 = _errs15 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.path !== void 0) {
                    const _errs17 = errors;
                    if (typeof data.path !== "string") {
                      validate18.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid0 = _errs17 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.scope !== void 0) {
                      let data6 = data.scope;
                      const _errs20 = errors;
                      if (typeof data6 !== "string") {
                        validate18.errors = [{ instancePath: instancePath + "/scope", schemaPath: "#/definitions/v2/SkillScope/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      if (!(data6 === "user" || data6 === "repo" || data6 === "system" || data6 === "admin")) {
                        validate18.errors = [{ instancePath: instancePath + "/scope", schemaPath: "#/definitions/v2/SkillScope/enum", keyword: "enum", params: { allowedValues: schema28.enum } }];
                        return false;
                      }
                      var valid0 = _errs20 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.shortDescription !== void 0) {
                        let data7 = data.shortDescription;
                        const _errs23 = errors;
                        if (typeof data7 !== "string" && data7 !== null) {
                          validate18.errors = [{ instancePath: instancePath + "/shortDescription", schemaPath: "#/properties/shortDescription/type", keyword: "type", params: { type: schema21.properties.shortDescription.type } }];
                          return false;
                        }
                        var valid0 = _errs23 === errors;
                      } else {
                        var valid0 = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate18.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate18.errors = vErrors;
  return errors === 0;
}
function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.cwd === void 0 && (missing0 = "cwd") || data.errors === void 0 && (missing0 = "errors") || data.skills === void 0 && (missing0 = "skills")) {
        validate17.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.cwd !== void 0) {
          const _errs1 = errors;
          if (typeof data.cwd !== "string") {
            validate17.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/properties/cwd/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.errors !== void 0) {
            let data1 = data.errors;
            const _errs3 = errors;
            if (errors === _errs3) {
              if (Array.isArray(data1)) {
                var valid1 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  let data2 = data1[i0];
                  const _errs5 = errors;
                  const _errs6 = errors;
                  if (errors === _errs6) {
                    if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                      let missing1;
                      if (data2.message === void 0 && (missing1 = "message") || data2.path === void 0 && (missing1 = "path")) {
                        validate17.errors = [{ instancePath: instancePath + "/errors/" + i0, schemaPath: "#/definitions/v2/SkillErrorInfo/required", keyword: "required", params: { missingProperty: missing1 } }];
                        return false;
                      } else {
                        if (data2.message !== void 0) {
                          const _errs8 = errors;
                          if (typeof data2.message !== "string") {
                            validate17.errors = [{ instancePath: instancePath + "/errors/" + i0 + "/message", schemaPath: "#/definitions/v2/SkillErrorInfo/properties/message/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          var valid3 = _errs8 === errors;
                        } else {
                          var valid3 = true;
                        }
                        if (valid3) {
                          if (data2.path !== void 0) {
                            const _errs10 = errors;
                            if (typeof data2.path !== "string") {
                              validate17.errors = [{ instancePath: instancePath + "/errors/" + i0 + "/path", schemaPath: "#/definitions/v2/SkillErrorInfo/properties/path/type", keyword: "type", params: { type: "string" } }];
                              return false;
                            }
                            var valid3 = _errs10 === errors;
                          } else {
                            var valid3 = true;
                          }
                        }
                      }
                    } else {
                      validate17.errors = [{ instancePath: instancePath + "/errors/" + i0, schemaPath: "#/definitions/v2/SkillErrorInfo/type", keyword: "type", params: { type: "object" } }];
                      return false;
                    }
                  }
                  var valid1 = _errs5 === errors;
                  if (!valid1) {
                    break;
                  }
                }
              } else {
                validate17.errors = [{ instancePath: instancePath + "/errors", schemaPath: "#/properties/errors/type", keyword: "type", params: { type: "array" } }];
                return false;
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.skills !== void 0) {
              let data5 = data.skills;
              const _errs12 = errors;
              if (errors === _errs12) {
                if (Array.isArray(data5)) {
                  var valid4 = true;
                  const len1 = data5.length;
                  for (let i1 = 0; i1 < len1; i1++) {
                    const _errs14 = errors;
                    if (!validate18(data5[i1], { instancePath: instancePath + "/skills/" + i1, parentData: data5, parentDataProperty: i1, rootData })) {
                      vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
                      errors = vErrors.length;
                    }
                    var valid4 = _errs14 === errors;
                    if (!valid4) {
                      break;
                    }
                  }
                } else {
                  validate17.errors = [{ instancePath: instancePath + "/skills", schemaPath: "#/properties/skills/type", keyword: "type", params: { type: "array" } }];
                  return false;
                }
              }
              var valid0 = _errs12 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate17.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate17.errors = vErrors;
  return errors === 0;
}
function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.data === void 0 && (missing0 = "data")) {
        validate16.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.data !== void 0) {
          let data0 = data.data;
          const _errs1 = errors;
          if (errors === _errs1) {
            if (Array.isArray(data0)) {
              var valid1 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                const _errs3 = errors;
                if (!validate17(data0[i0], { instancePath: instancePath + "/data/" + i0, parentData: data0, parentDataProperty: i0, rootData })) {
                  vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
                  errors = vErrors.length;
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate16.errors = [{ instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: "array" } }];
              return false;
            }
          }
        }
      }
    } else {
      validate16.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate16.errors = vErrors;
  return errors === 0;
}
function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate16(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
    errors = vErrors.length;
  }
  validate15.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadListResponse = validate26;
var schema30 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "backwardsCursor": { "description": "Opaque cursor to pass as `cursor` when reversing `sortDirection`. This is only populated when the page contains at least one thread. Use it with the opposite `sortDirection`; for timestamp sorts it anchors at the start of the page timestamp so same-second updates are not skipped.", "type": ["string", "null"] }, "data": { "items": { "$ref": "#/definitions/v2/Thread" }, "type": "array" }, "nextCursor": { "description": "Opaque cursor to pass to the next call to continue after the last item. if None, there are no more items to return.", "type": ["string", "null"] } }, "required": ["data"], "title": "ThreadListResponse", "type": "object" };
var schema31 = { "properties": { "agentNickname": { "description": "Optional random unique nickname assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "agentRole": { "description": "Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "cliVersion": { "description": "Version of the CLI that created the thread.", "type": "string" }, "createdAt": { "description": "Unix timestamp (in seconds) when the thread was created.", "format": "int64", "type": "integer" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }], "description": "Working directory captured for the thread." }, "ephemeral": { "description": "Whether the thread is ephemeral and should not be materialized on disk.", "type": "boolean" }, "forkedFromId": { "description": "Source thread id when this thread was created by forking another thread.", "type": ["string", "null"] }, "gitInfo": { "anyOf": [{ "$ref": "#/definitions/v2/GitInfo" }, { "type": "null" }], "description": "Optional Git metadata captured when the thread was created." }, "id": { "description": "Identifier for this thread. Codex-generated thread IDs are UUIDv7.", "type": "string" }, "modelProvider": { "description": "Model provider used for this thread (for example, 'openai').", "type": "string" }, "name": { "description": "Optional user-facing thread title.", "type": ["string", "null"] }, "parentThreadId": { "description": "The ID of the parent thread. This will only be set if this thread is a subagent.", "type": ["string", "null"] }, "path": { "description": "[UNSTABLE] Path to the thread on disk.", "type": ["string", "null"] }, "preview": { "description": "Usually the first user message in the thread, if available.", "type": "string" }, "recencyAt": { "description": "Unix timestamp (in seconds) used for thread recency ordering.", "format": "int64", "type": ["integer", "null"] }, "section": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSection" }, { "type": "null" }], "default": null, "description": "The independently persisted section selected for this thread, if any." }, "sectionEnteredAt": { "default": null, "description": "Unix timestamp in seconds when the thread entered its current section.", "format": "int64", "type": ["integer", "null"] }, "sessionId": { "description": "Session id shared by threads that belong to the same session tree.", "type": "string" }, "source": { "allOf": [{ "$ref": "#/definitions/v2/SessionSource" }], "description": "Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.)." }, "status": { "allOf": [{ "$ref": "#/definitions/v2/ThreadStatus" }], "description": "Current runtime status for the thread." }, "threadSource": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSource" }, { "type": "null" }], "description": "Optional analytics source classification for this thread." }, "turns": { "description": "Only populated on `thread/resume`, `thread/rollback`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.", "items": { "$ref": "#/definitions/v2/Turn" }, "type": "array" }, "updatedAt": { "description": "Unix timestamp (in seconds) when the thread was last updated.", "format": "int64", "type": "integer" } }, "required": ["cliVersion", "createdAt", "cwd", "ephemeral", "id", "modelProvider", "preview", "sessionId", "source", "status", "turns", "updatedAt"], "type": "object" };
var schema33 = { "properties": { "branch": { "type": ["string", "null"] }, "originUrl": { "type": ["string", "null"] }, "sha": { "type": ["string", "null"] } }, "type": "object" };
var schema35 = { "description": "Extensible visual presentation for a custom thread section.", "properties": { "color": { "type": ["string", "null"] }, "icon": { "type": ["string", "null"] } }, "type": "object" };
function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.name === void 0 && (missing0 = "name")) {
        validate29.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.appearance !== void 0) {
          let data0 = data.appearance;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          const _errs4 = errors;
          if (errors === _errs4) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              if (data0.color !== void 0) {
                let data1 = data0.color;
                const _errs6 = errors;
                if (typeof data1 !== "string" && data1 !== null) {
                  const err0 = { instancePath: instancePath + "/appearance/color", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/color/type", keyword: "type", params: { type: schema35.properties.color.type } };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var valid3 = _errs6 === errors;
              } else {
                var valid3 = true;
              }
              if (valid3) {
                if (data0.icon !== void 0) {
                  let data2 = data0.icon;
                  const _errs8 = errors;
                  if (typeof data2 !== "string" && data2 !== null) {
                    const err1 = { instancePath: instancePath + "/appearance/icon", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/icon/type", keyword: "type", params: { type: schema35.properties.icon.type } };
                    if (vErrors === null) {
                      vErrors = [err1];
                    } else {
                      vErrors.push(err1);
                    }
                    errors++;
                  }
                  var valid3 = _errs8 === errors;
                } else {
                  var valid3 = true;
                }
              }
            } else {
              const err2 = { instancePath: instancePath + "/appearance", schemaPath: "#/definitions/v2/ThreadSectionAppearance/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs10 = errors;
            if (data0 !== null) {
              const err3 = { instancePath: instancePath + "/appearance", schemaPath: "#/properties/appearance/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var _valid0 = _errs10 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err4 = { instancePath: instancePath + "/appearance", schemaPath: "#/properties/appearance/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
            validate29.errors = vErrors;
            return false;
          } else {
            errors = _errs2;
            if (vErrors !== null) {
              if (_errs2) {
                vErrors.length = _errs2;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.id !== void 0) {
            const _errs12 = errors;
            if (typeof data.id !== "string") {
              validate29.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs12 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.name !== void 0) {
              const _errs14 = errors;
              if (typeof data.name !== "string") {
                validate29.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs14 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate29.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate29.errors = vErrors;
  return errors === 0;
}
var schema36 = { "oneOf": [{ "enum": ["cli", "vscode", "exec", "appServer", "unknown"], "type": "string" }, { "additionalProperties": false, "properties": { "custom": { "type": "string" } }, "required": ["custom"], "title": "CustomSessionSource", "type": "object" }, { "additionalProperties": false, "properties": { "subAgent": { "$ref": "#/definitions/v2/SubAgentSource" } }, "required": ["subAgent"], "title": "SubAgentSessionSource", "type": "object" }] };
var schema37 = { "oneOf": [{ "enum": ["review", "compact", "memory_consolidation"], "type": "string" }, { "additionalProperties": false, "properties": { "thread_spawn": { "properties": { "agent_nickname": { "default": null, "type": ["string", "null"] }, "agent_path": { "anyOf": [{ "$ref": "#/definitions/v2/AgentPath" }, { "type": "null" }], "default": null }, "agent_role": { "default": null, "type": ["string", "null"] }, "depth": { "format": "int32", "type": "integer" }, "parent_thread_id": { "$ref": "#/definitions/v2/ThreadId" } }, "required": ["depth", "parent_thread_id"], "type": "object" } }, "required": ["thread_spawn"], "title": "ThreadSpawnSubAgentSource", "type": "object" }, { "additionalProperties": false, "properties": { "other": { "type": "string" } }, "required": ["other"], "title": "OtherSubAgentSource", "type": "object" }] };
function validate32(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== "string") {
    const err0 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "string" } };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === "review" || data === "compact" || data === "memory_consolidation")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema37.oneOf[0].enum } };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread_spawn === void 0 && (missing0 = "thread_spawn")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === "thread_spawn")) {
            const err3 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 } };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.thread_spawn !== void 0) {
            let data0 = data.thread_spawn;
            const _errs6 = errors;
            if (errors === _errs6) {
              if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
                let missing1;
                if (data0.depth === void 0 && (missing1 = "depth") || data0.parent_thread_id === void 0 && (missing1 = "parent_thread_id")) {
                  const err4 = { instancePath: instancePath + "/thread_spawn", schemaPath: "#/oneOf/1/properties/thread_spawn/required", keyword: "required", params: { missingProperty: missing1 } };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                } else {
                  if (data0.agent_nickname !== void 0) {
                    let data1 = data0.agent_nickname;
                    const _errs8 = errors;
                    if (typeof data1 !== "string" && data1 !== null) {
                      const err5 = { instancePath: instancePath + "/thread_spawn/agent_nickname", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_nickname/type", keyword: "type", params: { type: schema37.oneOf[1].properties.thread_spawn.properties.agent_nickname.type } };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    var valid2 = _errs8 === errors;
                  } else {
                    var valid2 = true;
                  }
                  if (valid2) {
                    if (data0.agent_path !== void 0) {
                      let data2 = data0.agent_path;
                      const _errs10 = errors;
                      const _errs11 = errors;
                      let valid3 = false;
                      const _errs12 = errors;
                      if (typeof data2 !== "string") {
                        const err6 = { instancePath: instancePath + "/thread_spawn/agent_path", schemaPath: "#/definitions/v2/AgentPath/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err6];
                        } else {
                          vErrors.push(err6);
                        }
                        errors++;
                      }
                      var _valid1 = _errs12 === errors;
                      valid3 = valid3 || _valid1;
                      if (!valid3) {
                        const _errs15 = errors;
                        if (data2 !== null) {
                          const err7 = { instancePath: instancePath + "/thread_spawn/agent_path", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_path/anyOf/1/type", keyword: "type", params: { type: "null" } };
                          if (vErrors === null) {
                            vErrors = [err7];
                          } else {
                            vErrors.push(err7);
                          }
                          errors++;
                        }
                        var _valid1 = _errs15 === errors;
                        valid3 = valid3 || _valid1;
                      }
                      if (!valid3) {
                        const err8 = { instancePath: instancePath + "/thread_spawn/agent_path", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_path/anyOf", keyword: "anyOf", params: {} };
                        if (vErrors === null) {
                          vErrors = [err8];
                        } else {
                          vErrors.push(err8);
                        }
                        errors++;
                      } else {
                        errors = _errs11;
                        if (vErrors !== null) {
                          if (_errs11) {
                            vErrors.length = _errs11;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                      var valid2 = _errs10 === errors;
                    } else {
                      var valid2 = true;
                    }
                    if (valid2) {
                      if (data0.agent_role !== void 0) {
                        let data3 = data0.agent_role;
                        const _errs17 = errors;
                        if (typeof data3 !== "string" && data3 !== null) {
                          const err9 = { instancePath: instancePath + "/thread_spawn/agent_role", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_role/type", keyword: "type", params: { type: schema37.oneOf[1].properties.thread_spawn.properties.agent_role.type } };
                          if (vErrors === null) {
                            vErrors = [err9];
                          } else {
                            vErrors.push(err9);
                          }
                          errors++;
                        }
                        var valid2 = _errs17 === errors;
                      } else {
                        var valid2 = true;
                      }
                      if (valid2) {
                        if (data0.depth !== void 0) {
                          let data4 = data0.depth;
                          const _errs19 = errors;
                          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                            const err10 = { instancePath: instancePath + "/thread_spawn/depth", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/depth/type", keyword: "type", params: { type: "integer" } };
                            if (vErrors === null) {
                              vErrors = [err10];
                            } else {
                              vErrors.push(err10);
                            }
                            errors++;
                          }
                          var valid2 = _errs19 === errors;
                        } else {
                          var valid2 = true;
                        }
                        if (valid2) {
                          if (data0.parent_thread_id !== void 0) {
                            const _errs21 = errors;
                            if (typeof data0.parent_thread_id !== "string") {
                              const err11 = { instancePath: instancePath + "/thread_spawn/parent_thread_id", schemaPath: "#/definitions/v2/ThreadId/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err11];
                              } else {
                                vErrors.push(err11);
                              }
                              errors++;
                            }
                            var valid2 = _errs21 === errors;
                          } else {
                            var valid2 = true;
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                const err12 = { instancePath: instancePath + "/thread_spawn", schemaPath: "#/oneOf/1/properties/thread_spawn/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
          }
        }
      }
    } else {
      const err13 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs24 = errors;
    if (errors === _errs24) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.other === void 0 && (missing2 = "other")) {
          const err14 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        } else {
          const _errs26 = errors;
          for (const key1 in data) {
            if (!(key1 === "other")) {
              const err15 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 } };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
              break;
            }
          }
          if (_errs26 === errors) {
            if (data.other !== void 0) {
              if (typeof data.other !== "string") {
                const err16 = { instancePath: instancePath + "/other", schemaPath: "#/oneOf/2/properties/other/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          }
        }
      } else {
        const err17 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    var _valid0 = _errs24 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err18 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
    validate32.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate32.errors = vErrors;
  return errors === 0;
}
function validate31(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== "string") {
    const err0 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "string" } };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === "cli" || data === "vscode" || data === "exec" || data === "appServer" || data === "unknown")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema36.oneOf[0].enum } };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.custom === void 0 && (missing0 = "custom")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === "custom")) {
            const err3 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 } };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.custom !== void 0) {
            if (typeof data.custom !== "string") {
              const err4 = { instancePath: instancePath + "/custom", schemaPath: "#/oneOf/1/properties/custom/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs8 = errors;
    if (errors === _errs8) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing1;
        if (data.subAgent === void 0 && (missing1 = "subAgent")) {
          const err6 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing1 } };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        } else {
          const _errs10 = errors;
          for (const key1 in data) {
            if (!(key1 === "subAgent")) {
              const err7 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 } };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
              break;
            }
          }
          if (_errs10 === errors) {
            if (data.subAgent !== void 0) {
              if (!validate32(data.subAgent, { instancePath: instancePath + "/subAgent", parentData: data, parentDataProperty: "subAgent", rootData })) {
                vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
                errors = vErrors.length;
              }
            }
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    var _valid0 = _errs8 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err9 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
    validate31.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate31.errors = vErrors;
  return errors === 0;
}
var schema40 = { "oneOf": [{ "properties": { "type": { "enum": ["notLoaded"], "title": "NotLoadedThreadStatusType", "type": "string" } }, "required": ["type"], "title": "NotLoadedThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["idle"], "title": "IdleThreadStatusType", "type": "string" } }, "required": ["type"], "title": "IdleThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["systemError"], "title": "SystemErrorThreadStatusType", "type": "string" } }, "required": ["type"], "title": "SystemErrorThreadStatus", "type": "object" }, { "properties": { "activeFlags": { "items": { "$ref": "#/definitions/v2/ThreadActiveFlag" }, "type": "array" }, "type": { "enum": ["active"], "title": "ActiveThreadStatusType", "type": "string" } }, "required": ["activeFlags", "type"], "title": "ActiveThreadStatus", "type": "object" }] };
var schema41 = { "enum": ["waitingOnApproval", "waitingOnUserInput"], "type": "string" };
function validate35(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err1 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (!(data0 === "notLoaded")) {
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema40.oneOf[0].properties.type.enum } };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      }
    } else {
      const err3 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (errors === _errs5) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = "type")) {
        const err4 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data1 = data.type;
          if (typeof data1 !== "string") {
            const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === "idle")) {
            const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema40.oneOf[1].properties.type.enum } };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs9 = errors;
    if (errors === _errs9) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = "type")) {
          const err8 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.type !== void 0) {
            let data2 = data.type;
            if (typeof data2 !== "string") {
              const err9 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (!(data2 === "systemError")) {
              const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema40.oneOf[2].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    var _valid0 = _errs9 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs13 = errors;
      if (errors === _errs13) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.activeFlags === void 0 && (missing3 = "activeFlags") || data.type === void 0 && (missing3 = "type")) {
            const err12 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          } else {
            if (data.activeFlags !== void 0) {
              let data3 = data.activeFlags;
              const _errs15 = errors;
              if (errors === _errs15) {
                if (Array.isArray(data3)) {
                  var valid5 = true;
                  const len0 = data3.length;
                  for (let i0 = 0; i0 < len0; i0++) {
                    let data4 = data3[i0];
                    const _errs17 = errors;
                    if (typeof data4 !== "string") {
                      const err13 = { instancePath: instancePath + "/activeFlags/" + i0, schemaPath: "#/definitions/v2/ThreadActiveFlag/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err13];
                      } else {
                        vErrors.push(err13);
                      }
                      errors++;
                    }
                    if (!(data4 === "waitingOnApproval" || data4 === "waitingOnUserInput")) {
                      const err14 = { instancePath: instancePath + "/activeFlags/" + i0, schemaPath: "#/definitions/v2/ThreadActiveFlag/enum", keyword: "enum", params: { allowedValues: schema41.enum } };
                      if (vErrors === null) {
                        vErrors = [err14];
                      } else {
                        vErrors.push(err14);
                      }
                      errors++;
                    }
                    var valid5 = _errs17 === errors;
                    if (!valid5) {
                      break;
                    }
                  }
                } else {
                  const err15 = { instancePath: instancePath + "/activeFlags", schemaPath: "#/oneOf/3/properties/activeFlags/type", keyword: "type", params: { type: "array" } };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              }
              var valid4 = _errs15 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.type !== void 0) {
                let data5 = data.type;
                const _errs20 = errors;
                if (typeof data5 !== "string") {
                  const err16 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                if (!(data5 === "active")) {
                  const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema40.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                var valid4 = _errs20 === errors;
              } else {
                var valid4 = true;
              }
            }
          }
        } else {
          const err18 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
      var _valid0 = _errs13 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err19 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err19];
    } else {
      vErrors.push(err19);
    }
    errors++;
    validate35.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate35.errors = vErrors;
  return errors === 0;
}
var schema43 = { "properties": { "completedAt": { "description": "Unix timestamp (in seconds) when the turn completed.", "format": "int64", "type": ["integer", "null"] }, "durationMs": { "description": "Duration between turn start and completion in milliseconds, if known.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/TurnError" }, { "type": "null" }], "description": "Only populated when the Turn's status is failed." }, "id": { "description": "Identifier for this turn. Codex-generated turn IDs are UUIDv7.", "type": "string" }, "items": { "description": "Thread items currently included in this turn payload.", "items": { "$ref": "#/definitions/v2/ThreadItem" }, "type": "array" }, "itemsView": { "allOf": [{ "$ref": "#/definitions/v2/TurnItemsView" }], "default": "full", "description": "Describes how much of `items` has been loaded for this turn." }, "startedAt": { "description": "Unix timestamp (in seconds) when the turn started.", "format": "int64", "type": ["integer", "null"] }, "status": { "$ref": "#/definitions/v2/TurnStatus" } }, "required": ["id", "items", "status"], "type": "object" };
var schema81 = { "oneOf": [{ "description": "`items` was not loaded for this turn. The field is intentionally empty.", "enum": ["notLoaded"], "type": "string" }, { "description": "`items` contains only a display summary for this turn.", "enum": ["summary"], "type": "string" }, { "description": "`items` contains every ThreadItem available from persisted app-server history for this turn.", "enum": ["full"], "type": "string" }] };
var schema82 = { "enum": ["completed", "interrupted", "failed", "inProgress"], "type": "string" };
var schema44 = { "properties": { "additionalDetails": { "default": null, "type": ["string", "null"] }, "codexErrorInfo": { "anyOf": [{ "$ref": "#/definitions/v2/CodexErrorInfo" }, { "type": "null" }] }, "message": { "type": "string" } }, "required": ["message"], "type": "object" };
var schema45 = { "description": "This translation layer make sure that we expose codex error code in camel case.\n\nWhen an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.", "oneOf": [{ "enum": ["contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "serverOverloaded", "cyberPolicy", "misalignmentPolicyViolation", "internalServerError", "unauthorized", "badRequest", "threadRollbackFailed", "sandboxError", "other"], "type": "string" }, { "additionalProperties": false, "properties": { "httpConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["httpConnectionFailed"], "title": "HttpConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Failed to connect to the response SSE stream.", "properties": { "responseStreamConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamConnectionFailed"], "title": "ResponseStreamConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "The response SSE stream disconnected in the middle of a turn before completion.", "properties": { "responseStreamDisconnected": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamDisconnected"], "title": "ResponseStreamDisconnectedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Reached the retry limit for responses.", "properties": { "responseTooManyFailedAttempts": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseTooManyFailedAttempts"], "title": "ResponseTooManyFailedAttemptsCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.", "properties": { "activeTurnNotSteerable": { "properties": { "turnKind": { "$ref": "#/definitions/v2/NonSteerableTurnKind" } }, "required": ["turnKind"], "type": "object" } }, "required": ["activeTurnNotSteerable"], "title": "ActiveTurnNotSteerableCodexErrorInfo", "type": "object" }] };
var schema46 = { "enum": ["review", "compact"], "type": "string" };
function validate39(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (typeof data !== "string") {
    const err0 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "string" } };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === "contextWindowExceeded" || data === "sessionBudgetExceeded" || data === "usageLimitExceeded" || data === "serverOverloaded" || data === "cyberPolicy" || data === "misalignmentPolicyViolation" || data === "internalServerError" || data === "unauthorized" || data === "badRequest" || data === "threadRollbackFailed" || data === "sandboxError" || data === "other")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema45.oneOf[0].enum } };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (errors === _errs3) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.httpConnectionFailed === void 0 && (missing0 = "httpConnectionFailed")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      } else {
        const _errs5 = errors;
        for (const key0 in data) {
          if (!(key0 === "httpConnectionFailed")) {
            const err3 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 } };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
            break;
          }
        }
        if (_errs5 === errors) {
          if (data.httpConnectionFailed !== void 0) {
            let data0 = data.httpConnectionFailed;
            const _errs6 = errors;
            if (errors === _errs6) {
              if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
                if (data0.httpStatusCode !== void 0) {
                  let data1 = data0.httpStatusCode;
                  const _errs8 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1)) && data1 !== null) {
                    const err4 = { instancePath: instancePath + "/httpConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/1/properties/httpConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema45.oneOf[1].properties.httpConnectionFailed.properties.httpStatusCode.type } };
                    if (vErrors === null) {
                      vErrors = [err4];
                    } else {
                      vErrors.push(err4);
                    }
                    errors++;
                  }
                  if (errors === _errs8) {
                    if (typeof data1 == "number" && isFinite(data1)) {
                      if (data1 < 0 || isNaN(data1)) {
                        const err5 = { instancePath: instancePath + "/httpConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/1/properties/httpConnectionFailed/properties/httpStatusCode/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                        if (vErrors === null) {
                          vErrors = [err5];
                        } else {
                          vErrors.push(err5);
                        }
                        errors++;
                      }
                    }
                  }
                }
              } else {
                const err6 = { instancePath: instancePath + "/httpConnectionFailed", schemaPath: "#/oneOf/1/properties/httpConnectionFailed/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
          }
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs10 = errors;
    if (errors === _errs10) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing1;
        if (data.responseStreamConnectionFailed === void 0 && (missing1 = "responseStreamConnectionFailed")) {
          const err8 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing1 } };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          const _errs12 = errors;
          for (const key1 in data) {
            if (!(key1 === "responseStreamConnectionFailed")) {
              const err9 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 } };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
              break;
            }
          }
          if (_errs12 === errors) {
            if (data.responseStreamConnectionFailed !== void 0) {
              let data2 = data.responseStreamConnectionFailed;
              const _errs13 = errors;
              if (errors === _errs13) {
                if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                  if (data2.httpStatusCode !== void 0) {
                    let data3 = data2.httpStatusCode;
                    const _errs15 = errors;
                    if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3)) && data3 !== null) {
                      const err10 = { instancePath: instancePath + "/responseStreamConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema45.oneOf[2].properties.responseStreamConnectionFailed.properties.httpStatusCode.type } };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                    if (errors === _errs15) {
                      if (typeof data3 == "number" && isFinite(data3)) {
                        if (data3 < 0 || isNaN(data3)) {
                          const err11 = { instancePath: instancePath + "/responseStreamConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                          if (vErrors === null) {
                            vErrors = [err11];
                          } else {
                            vErrors.push(err11);
                          }
                          errors++;
                        }
                      }
                    }
                  }
                } else {
                  const err12 = { instancePath: instancePath + "/responseStreamConnectionFailed", schemaPath: "#/oneOf/2/properties/responseStreamConnectionFailed/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            }
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    var _valid0 = _errs10 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs17 = errors;
      if (errors === _errs17) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing2;
          if (data.responseStreamDisconnected === void 0 && (missing2 = "responseStreamDisconnected")) {
            const err14 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing2 } };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          } else {
            const _errs19 = errors;
            for (const key2 in data) {
              if (!(key2 === "responseStreamDisconnected")) {
                const err15 = { instancePath, schemaPath: "#/oneOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 } };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
                break;
              }
            }
            if (_errs19 === errors) {
              if (data.responseStreamDisconnected !== void 0) {
                let data4 = data.responseStreamDisconnected;
                const _errs20 = errors;
                if (errors === _errs20) {
                  if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                    if (data4.httpStatusCode !== void 0) {
                      let data5 = data4.httpStatusCode;
                      const _errs22 = errors;
                      if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5)) && data5 !== null) {
                        const err16 = { instancePath: instancePath + "/responseStreamDisconnected/httpStatusCode", schemaPath: "#/oneOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/type", keyword: "type", params: { type: schema45.oneOf[3].properties.responseStreamDisconnected.properties.httpStatusCode.type } };
                        if (vErrors === null) {
                          vErrors = [err16];
                        } else {
                          vErrors.push(err16);
                        }
                        errors++;
                      }
                      if (errors === _errs22) {
                        if (typeof data5 == "number" && isFinite(data5)) {
                          if (data5 < 0 || isNaN(data5)) {
                            const err17 = { instancePath: instancePath + "/responseStreamDisconnected/httpStatusCode", schemaPath: "#/oneOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                            if (vErrors === null) {
                              vErrors = [err17];
                            } else {
                              vErrors.push(err17);
                            }
                            errors++;
                          }
                        }
                      }
                    }
                  } else {
                    const err18 = { instancePath: instancePath + "/responseStreamDisconnected", schemaPath: "#/oneOf/3/properties/responseStreamDisconnected/type", keyword: "type", params: { type: "object" } };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
              }
            }
          }
        } else {
          const err19 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      var _valid0 = _errs17 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs24 = errors;
        if (errors === _errs24) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing3;
            if (data.responseTooManyFailedAttempts === void 0 && (missing3 = "responseTooManyFailedAttempts")) {
              const err20 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing3 } };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            } else {
              const _errs26 = errors;
              for (const key3 in data) {
                if (!(key3 === "responseTooManyFailedAttempts")) {
                  const err21 = { instancePath, schemaPath: "#/oneOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 } };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                  break;
                }
              }
              if (_errs26 === errors) {
                if (data.responseTooManyFailedAttempts !== void 0) {
                  let data6 = data.responseTooManyFailedAttempts;
                  const _errs27 = errors;
                  if (errors === _errs27) {
                    if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
                      if (data6.httpStatusCode !== void 0) {
                        let data7 = data6.httpStatusCode;
                        const _errs29 = errors;
                        if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7)) && data7 !== null) {
                          const err22 = { instancePath: instancePath + "/responseTooManyFailedAttempts/httpStatusCode", schemaPath: "#/oneOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/type", keyword: "type", params: { type: schema45.oneOf[4].properties.responseTooManyFailedAttempts.properties.httpStatusCode.type } };
                          if (vErrors === null) {
                            vErrors = [err22];
                          } else {
                            vErrors.push(err22);
                          }
                          errors++;
                        }
                        if (errors === _errs29) {
                          if (typeof data7 == "number" && isFinite(data7)) {
                            if (data7 < 0 || isNaN(data7)) {
                              const err23 = { instancePath: instancePath + "/responseTooManyFailedAttempts/httpStatusCode", schemaPath: "#/oneOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                              if (vErrors === null) {
                                vErrors = [err23];
                              } else {
                                vErrors.push(err23);
                              }
                              errors++;
                            }
                          }
                        }
                      }
                    } else {
                      const err24 = { instancePath: instancePath + "/responseTooManyFailedAttempts", schemaPath: "#/oneOf/4/properties/responseTooManyFailedAttempts/type", keyword: "type", params: { type: "object" } };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  }
                }
              }
            }
          } else {
            const err25 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        var _valid0 = _errs24 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs31 = errors;
          if (errors === _errs31) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing4;
              if (data.activeTurnNotSteerable === void 0 && (missing4 = "activeTurnNotSteerable")) {
                const err26 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing4 } };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              } else {
                const _errs33 = errors;
                for (const key4 in data) {
                  if (!(key4 === "activeTurnNotSteerable")) {
                    const err27 = { instancePath, schemaPath: "#/oneOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 } };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                    break;
                  }
                }
                if (_errs33 === errors) {
                  if (data.activeTurnNotSteerable !== void 0) {
                    let data8 = data.activeTurnNotSteerable;
                    const _errs34 = errors;
                    if (errors === _errs34) {
                      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                        let missing5;
                        if (data8.turnKind === void 0 && (missing5 = "turnKind")) {
                          const err28 = { instancePath: instancePath + "/activeTurnNotSteerable", schemaPath: "#/oneOf/5/properties/activeTurnNotSteerable/required", keyword: "required", params: { missingProperty: missing5 } };
                          if (vErrors === null) {
                            vErrors = [err28];
                          } else {
                            vErrors.push(err28);
                          }
                          errors++;
                        } else {
                          if (data8.turnKind !== void 0) {
                            let data9 = data8.turnKind;
                            if (typeof data9 !== "string") {
                              const err29 = { instancePath: instancePath + "/activeTurnNotSteerable/turnKind", schemaPath: "#/definitions/v2/NonSteerableTurnKind/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err29];
                              } else {
                                vErrors.push(err29);
                              }
                              errors++;
                            }
                            if (!(data9 === "review" || data9 === "compact")) {
                              const err30 = { instancePath: instancePath + "/activeTurnNotSteerable/turnKind", schemaPath: "#/definitions/v2/NonSteerableTurnKind/enum", keyword: "enum", params: { allowedValues: schema46.enum } };
                              if (vErrors === null) {
                                vErrors = [err30];
                              } else {
                                vErrors.push(err30);
                              }
                              errors++;
                            }
                          }
                        }
                      } else {
                        const err31 = { instancePath: instancePath + "/activeTurnNotSteerable", schemaPath: "#/oneOf/5/properties/activeTurnNotSteerable/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err31];
                        } else {
                          vErrors.push(err31);
                        }
                        errors++;
                      }
                    }
                  }
                }
              }
            } else {
              const err32 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
          var _valid0 = _errs31 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err33 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err33];
    } else {
      vErrors.push(err33);
    }
    errors++;
    validate39.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate39.errors = vErrors;
  return errors === 0;
}
function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = "message")) {
        validate38.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.additionalDetails !== void 0) {
          let data0 = data.additionalDetails;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate38.errors = [{ instancePath: instancePath + "/additionalDetails", schemaPath: "#/properties/additionalDetails/type", keyword: "type", params: { type: schema44.properties.additionalDetails.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.codexErrorInfo !== void 0) {
            let data1 = data.codexErrorInfo;
            const _errs3 = errors;
            const _errs4 = errors;
            let valid1 = false;
            const _errs5 = errors;
            if (!validate39(data1, { instancePath: instancePath + "/codexErrorInfo", parentData: data, parentDataProperty: "codexErrorInfo", rootData })) {
              vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
              errors = vErrors.length;
            }
            var _valid0 = _errs5 === errors;
            valid1 = valid1 || _valid0;
            if (!valid1) {
              const _errs6 = errors;
              if (data1 !== null) {
                const err0 = { instancePath: instancePath + "/codexErrorInfo", schemaPath: "#/properties/codexErrorInfo/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err0];
                } else {
                  vErrors.push(err0);
                }
                errors++;
              }
              var _valid0 = _errs6 === errors;
              valid1 = valid1 || _valid0;
            }
            if (!valid1) {
              const err1 = { instancePath: instancePath + "/codexErrorInfo", schemaPath: "#/properties/codexErrorInfo/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
              validate38.errors = vErrors;
              return false;
            } else {
              errors = _errs4;
              if (vErrors !== null) {
                if (_errs4) {
                  vErrors.length = _errs4;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.message !== void 0) {
              const _errs8 = errors;
              if (typeof data.message !== "string") {
                validate38.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate38.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate38.errors = vErrors;
  return errors === 0;
}
var schema47 = { "oneOf": [{ "properties": { "clientId": { "type": ["string", "null"] }, "content": { "items": { "$ref": "#/definitions/v2/UserInput" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["userMessage"], "title": "UserMessageThreadItemType", "type": "string" } }, "required": ["content", "id", "type"], "title": "UserMessageThreadItem", "type": "object" }, { "properties": { "fragments": { "items": { "$ref": "#/definitions/v2/HookPromptFragment" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["hookPrompt"], "title": "HookPromptThreadItemType", "type": "string" } }, "required": ["fragments", "id", "type"], "title": "HookPromptThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "memoryCitation": { "anyOf": [{ "$ref": "#/definitions/v2/MemoryCitation" }, { "type": "null" }], "default": null }, "phase": { "anyOf": [{ "$ref": "#/definitions/v2/MessagePhase" }, { "type": "null" }], "default": null }, "text": { "type": "string" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "AgentMessageThreadItem", "type": "object" }, { "description": "EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.", "properties": { "id": { "type": "string" }, "text": { "type": "string" }, "type": { "enum": ["plan"], "title": "PlanThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "PlanThreadItem", "type": "object" }, { "properties": { "content": { "default": [], "items": { "type": "string" }, "type": "array" }, "id": { "type": "string" }, "summary": { "default": [], "items": { "type": "string" }, "type": "array" }, "type": { "enum": ["reasoning"], "title": "ReasoningThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ReasoningThreadItem", "type": "object" }, { "properties": { "aggregatedOutput": { "description": "The command's output, aggregated from stdout and stderr.", "type": ["string", "null"] }, "command": { "description": "The command to be executed.", "type": "string" }, "commandActions": { "description": "A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.", "items": { "$ref": "#/definitions/v2/CommandAction" }, "type": "array" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/LegacyAppPathString" }], "description": "The command's working directory." }, "durationMs": { "description": "The duration of the command execution in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "exitCode": { "description": "The command's exit code.", "format": "int32", "type": ["integer", "null"] }, "id": { "type": "string" }, "pluginId": { "default": null, "description": "Trusted first-party plugin id when this command resolves to one plugin script.", "type": ["string", "null"] }, "processId": { "description": "Identifier for the underlying PTY process (when available).", "type": ["string", "null"] }, "scriptPath": { "default": null, "description": "Safe plugin-relative path when this command resolves to one plugin script.", "type": ["string", "null"] }, "source": { "allOf": [{ "$ref": "#/definitions/v2/CommandExecutionSource" }], "default": "agent" }, "status": { "$ref": "#/definitions/v2/CommandExecutionStatus" }, "type": { "enum": ["commandExecution"], "title": "CommandExecutionThreadItemType", "type": "string" } }, "required": ["command", "commandActions", "cwd", "id", "status", "type"], "title": "CommandExecutionThreadItem", "type": "object" }, { "properties": { "changes": { "items": { "$ref": "#/definitions/v2/FileUpdateChange" }, "type": "array" }, "id": { "type": "string" }, "status": { "$ref": "#/definitions/v2/PatchApplyStatus" }, "type": { "enum": ["fileChange"], "title": "FileChangeThreadItemType", "type": "string" } }, "required": ["changes", "id", "status", "type"], "title": "FileChangeThreadItem", "type": "object" }, { "properties": { "appContext": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallAppContext" }, { "type": "null" }] }, "arguments": true, "durationMs": { "description": "The duration of the MCP tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallError" }, { "type": "null" }] }, "id": { "type": "string" }, "mcpAppResourceUri": { "description": "Deprecated: use `appContext.resourceUri` instead.", "type": ["string", "null"] }, "pluginId": { "type": ["string", "null"] }, "readOnlyHint": { "type": ["boolean", "null"] }, "result": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallResult" }, { "type": "null" }] }, "server": { "type": "string" }, "status": { "$ref": "#/definitions/v2/McpToolCallStatus" }, "tool": { "type": "string" }, "type": { "enum": ["mcpToolCall"], "title": "McpToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "server", "status", "tool", "type"], "title": "McpToolCallThreadItem", "type": "object" }, { "properties": { "arguments": true, "contentItems": { "items": { "$ref": "#/definitions/v2/DynamicToolCallOutputContentItem" }, "type": ["array", "null"] }, "durationMs": { "description": "The duration of the dynamic tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "id": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/DynamicToolCallStatus" }, "success": { "type": ["boolean", "null"] }, "tool": { "type": "string" }, "type": { "enum": ["dynamicToolCall"], "title": "DynamicToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "status", "tool", "type"], "title": "DynamicToolCallThreadItem", "type": "object" }, { "properties": { "agentsStates": { "additionalProperties": { "$ref": "#/definitions/v2/CollabAgentState" }, "description": "Last known status of the target agents, when available.", "type": "object" }, "id": { "description": "Unique identifier for this collab tool call.", "type": "string" }, "model": { "description": "Model requested for the spawned agent, when applicable.", "type": ["string", "null"] }, "prompt": { "description": "Prompt text sent as part of the collab tool call, when available.", "type": ["string", "null"] }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }], "description": "Reasoning effort requested for the spawned agent, when applicable." }, "receiverThreadIds": { "description": "Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.", "items": { "type": "string" }, "type": "array" }, "senderThreadId": { "description": "Thread ID of the agent issuing the collab request.", "type": "string" }, "status": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentToolCallStatus" }], "description": "Current status of the collab tool call." }, "tool": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentTool" }], "description": "Name of the collab tool that was invoked." }, "type": { "enum": ["collabAgentToolCall"], "title": "CollabAgentToolCallThreadItemType", "type": "string" } }, "required": ["agentsStates", "id", "receiverThreadIds", "senderThreadId", "status", "tool", "type"], "title": "CollabAgentToolCallThreadItem", "type": "object" }, { "properties": { "agentPath": { "type": "string" }, "agentThreadId": { "type": "string" }, "id": { "type": "string" }, "kind": { "$ref": "#/definitions/v2/SubAgentActivityKind" }, "type": { "enum": ["subAgentActivity"], "title": "SubAgentActivityThreadItemType", "type": "string" } }, "required": ["agentPath", "agentThreadId", "id", "kind", "type"], "title": "SubAgentActivityThreadItem", "type": "object" }, { "properties": { "action": { "anyOf": [{ "$ref": "#/definitions/v2/WebSearchAction" }, { "type": "null" }] }, "id": { "type": "string" }, "query": { "type": "string" }, "results": { "default": null, "description": "Structured search results returned out-of-band by standalone web search.\n\nThese stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.", "items": true, "type": ["array", "null"] }, "type": { "enum": ["webSearch"], "title": "WebSearchThreadItemType", "type": "string" } }, "required": ["id", "query", "type"], "title": "WebSearchThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["imageView"], "title": "ImageViewThreadItemType", "type": "string" } }, "required": ["id", "path", "type"], "title": "ImageViewThreadItem", "type": "object" }, { "description": "Display item emitted by the interruptible `clock.sleep` tool.", "properties": { "durationMs": { "format": "uint64", "minimum": 0, "type": "integer" }, "id": { "type": "string" }, "type": { "enum": ["sleep"], "title": "SleepThreadItemType", "type": "string" } }, "required": ["durationMs", "id", "type"], "title": "SleepThreadItem", "type": "object" }, { "properties": { "failure": { "anyOf": [{ "$ref": "#/definitions/v2/ImageGenerationFailure" }, { "type": "null" }], "default": null }, "id": { "type": "string" }, "result": { "type": "string" }, "revisedPrompt": { "type": ["string", "null"] }, "savedPath": { "anyOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }, { "type": "null" }] }, "status": { "type": "string" }, "transparentBackground": { "default": null, "type": ["boolean", "null"] }, "type": { "enum": ["imageGeneration"], "title": "ImageGenerationThreadItemType", "type": "string" } }, "required": ["id", "result", "status", "type"], "title": "ImageGenerationThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["enteredReviewMode"], "title": "EnteredReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "EnteredReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["exitedReviewMode"], "title": "ExitedReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "ExitedReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "type": { "enum": ["contextCompaction"], "title": "ContextCompactionThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ContextCompactionThreadItem", "type": "object" }] };
var schema56 = { "description": 'Classifies an assistant message as interim commentary or final answer text.\n\nProviders do not emit this consistently, so callers must treat `None` as "phase unknown" and keep compatibility behavior for legacy models.', "oneOf": [{ "description": "Mid-turn assistant text (for example preamble/progress narration).\n\nAdditional tool calls or assistant output may follow before turn completion.", "enum": ["commentary"], "type": "string" }, { "description": "The assistant's terminal answer text for the current turn.", "enum": ["final_answer"], "type": "string" }] };
var schema60 = { "enum": ["agent", "userShell", "unifiedExecStartup", "unifiedExecInteraction"], "type": "string" };
var schema61 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema64 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema65 = { "properties": { "actionName": { "type": ["string", "null"] }, "appName": { "type": ["string", "null"] }, "connectorId": { "type": "string" }, "linkId": { "type": ["string", "null"] }, "resourceUri": { "type": ["string", "null"] } }, "required": ["connectorId"], "type": "object" };
var schema68 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema69 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "type": { "enum": ["inputText"], "title": "InputTextDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["text", "type"], "title": "InputTextDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "imageUrl": { "type": "string" }, "type": { "enum": ["inputImage"], "title": "InputImageDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["imageUrl", "type"], "title": "InputImageDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "audioUrl": { "type": "string" }, "type": { "enum": ["inputAudio"], "title": "InputAudioDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["audioUrl", "type"], "title": "InputAudioDynamicToolCallOutputContentItem", "type": "object" }] };
var schema70 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema74 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema75 = { "enum": ["spawnAgent", "sendInput", "resumeAgent", "wait", "closeAgent"], "type": "string" };
var schema76 = { "enum": ["started", "interacted", "interrupted"], "type": "string" };
var schema77 = { "oneOf": [{ "properties": { "queries": { "items": { "type": "string" }, "type": ["array", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "SearchWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["openPage"], "title": "OpenPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "OpenPageWebSearchAction", "type": "object" }, { "properties": { "pattern": { "type": ["string", "null"] }, "type": { "enum": ["findInPage"], "title": "FindInPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "FindInPageWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["other"], "title": "OtherWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "OtherWebSearchAction", "type": "object" }] };
var schema79 = { "oneOf": [{ "properties": { "limitId": { "type": "string" }, "resetsAt": { "format": "int64", "type": ["integer", "null"] }, "type": { "enum": ["usageLimitExceeded"], "title": "UsageLimitExceededImageGenerationFailureType", "type": "string" } }, "required": ["limitId", "type"], "title": "UsageLimitExceededImageGenerationFailure", "type": "object" }] };
var schema48 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "text_elements": { "default": [], "description": "UI-defined spans within `text` used to render or persist special elements.", "items": { "$ref": "#/definitions/v2/TextElement" }, "type": "array" }, "type": { "enum": ["text"], "title": "TextUserInputType", "type": "string" } }, "required": ["text", "type"], "title": "TextUserInput", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "type": { "enum": ["image"], "title": "ImageUserInputType", "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"], "title": "ImageUserInput", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "path": { "type": "string" }, "type": { "enum": ["localImage"], "title": "LocalImageUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalImageUserInput", "type": "object" }, { "properties": { "type": { "enum": ["audio"], "title": "AudioUserInputType", "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"], "title": "AudioUserInput", "type": "object" }, { "properties": { "path": { "type": "string" }, "type": { "enum": ["localAudio"], "title": "LocalAudioUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalAudioUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["skill"], "title": "SkillUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "SkillUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["mention"], "title": "MentionUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "MentionUserInput", "type": "object" }] };
var schema51 = { "enum": ["auto", "low", "high", "original"], "type": "string" };
var schema49 = { "properties": { "byteRange": { "allOf": [{ "$ref": "#/definitions/v2/ByteRange" }], "description": "Byte range in the parent `text` buffer that this element occupies." }, "placeholder": { "description": "Optional human-readable placeholder for the element, displayed in the UI.", "type": ["string", "null"] } }, "required": ["byteRange"], "type": "object" };
function validate44(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.byteRange === void 0 && (missing0 = "byteRange")) {
        validate44.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.byteRange !== void 0) {
          let data0 = data.byteRange;
          const _errs1 = errors;
          const _errs3 = errors;
          if (errors === _errs3) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing1;
              if (data0.end === void 0 && (missing1 = "end") || data0.start === void 0 && (missing1 = "start")) {
                validate44.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.end !== void 0) {
                  let data1 = data0.end;
                  const _errs5 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate44.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  if (errors === _errs5) {
                    if (typeof data1 == "number" && isFinite(data1)) {
                      if (data1 < 0 || isNaN(data1)) {
                        validate44.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
                        return false;
                      }
                    }
                  }
                  var valid3 = _errs5 === errors;
                } else {
                  var valid3 = true;
                }
                if (valid3) {
                  if (data0.start !== void 0) {
                    let data2 = data0.start;
                    const _errs7 = errors;
                    if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                      validate44.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/type", keyword: "type", params: { type: "integer" } }];
                      return false;
                    }
                    if (errors === _errs7) {
                      if (typeof data2 == "number" && isFinite(data2)) {
                        if (data2 < 0 || isNaN(data2)) {
                          validate44.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
                          return false;
                        }
                      }
                    }
                    var valid3 = _errs7 === errors;
                  } else {
                    var valid3 = true;
                  }
                }
              }
            } else {
              validate44.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/type", keyword: "type", params: { type: "object" } }];
              return false;
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.placeholder !== void 0) {
            let data3 = data.placeholder;
            const _errs9 = errors;
            if (typeof data3 !== "string" && data3 !== null) {
              validate44.errors = [{ instancePath: instancePath + "/placeholder", schemaPath: "#/properties/placeholder/type", keyword: "type", params: { type: schema49.properties.placeholder.type } }];
              return false;
            }
            var valid0 = _errs9 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate44.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate44.errors = vErrors;
  return errors === 0;
}
function validate43(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.text === void 0 && (missing0 = "text") || data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.text !== void 0) {
          const _errs3 = errors;
          if (typeof data.text !== "string") {
            const err1 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/0/properties/text/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.text_elements !== void 0) {
            let data1 = data.text_elements;
            const _errs5 = errors;
            if (errors === _errs5) {
              if (Array.isArray(data1)) {
                var valid2 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs7 = errors;
                  if (!validate44(data1[i0], { instancePath: instancePath + "/text_elements/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
                    errors = vErrors.length;
                  }
                  var valid2 = _errs7 === errors;
                  if (!valid2) {
                    break;
                  }
                }
              } else {
                const err2 = { instancePath: instancePath + "/text_elements", schemaPath: "#/oneOf/0/properties/text_elements/type", keyword: "type", params: { type: "array" } };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.type !== void 0) {
              let data3 = data.type;
              const _errs8 = errors;
              if (typeof data3 !== "string") {
                const err3 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              if (!(data3 === "text")) {
                const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[0].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var valid1 = _errs8 === errors;
            } else {
              var valid1 = true;
            }
          }
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (errors === _errs10) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = "type") || data.url === void 0 && (missing1 = "url")) {
        const err6 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data4 = data.detail;
          const _errs12 = errors;
          const _errs13 = errors;
          let valid4 = false;
          const _errs14 = errors;
          if (typeof data4 !== "string") {
            const err7 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data4 === "auto" || data4 === "low" || data4 === "high" || data4 === "original")) {
            const err8 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema51.enum } };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          var _valid1 = _errs14 === errors;
          valid4 = valid4 || _valid1;
          if (!valid4) {
            const _errs17 = errors;
            if (data4 !== null) {
              const err9 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            var _valid1 = _errs17 === errors;
            valid4 = valid4 || _valid1;
          }
          if (!valid4) {
            const err10 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          } else {
            errors = _errs13;
            if (vErrors !== null) {
              if (_errs13) {
                vErrors.length = _errs13;
              } else {
                vErrors = null;
              }
            }
          }
          var valid3 = _errs12 === errors;
        } else {
          var valid3 = true;
        }
        if (valid3) {
          if (data.type !== void 0) {
            let data5 = data.type;
            const _errs19 = errors;
            if (typeof data5 !== "string") {
              const err11 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (!(data5 === "image")) {
              const err12 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            var valid3 = _errs19 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.url !== void 0) {
              const _errs21 = errors;
              if (typeof data.url !== "string") {
                const err13 = { instancePath: instancePath + "/url", schemaPath: "#/oneOf/1/properties/url/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              var valid3 = _errs21 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      }
    } else {
      const err14 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs23 = errors;
    if (errors === _errs23) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.path === void 0 && (missing2 = "path") || data.type === void 0 && (missing2 = "type")) {
          const err15 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        } else {
          if (data.detail !== void 0) {
            let data7 = data.detail;
            const _errs25 = errors;
            const _errs26 = errors;
            let valid7 = false;
            const _errs27 = errors;
            if (typeof data7 !== "string") {
              const err16 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (!(data7 === "auto" || data7 === "low" || data7 === "high" || data7 === "original")) {
              const err17 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema51.enum } };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            var _valid2 = _errs27 === errors;
            valid7 = valid7 || _valid2;
            if (!valid7) {
              const _errs30 = errors;
              if (data7 !== null) {
                const err18 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/2/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              var _valid2 = _errs30 === errors;
              valid7 = valid7 || _valid2;
            }
            if (!valid7) {
              const err19 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/2/properties/detail/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            } else {
              errors = _errs26;
              if (vErrors !== null) {
                if (_errs26) {
                  vErrors.length = _errs26;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid6 = _errs25 === errors;
          } else {
            var valid6 = true;
          }
          if (valid6) {
            if (data.path !== void 0) {
              const _errs32 = errors;
              if (typeof data.path !== "string") {
                const err20 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/2/properties/path/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              var valid6 = _errs32 === errors;
            } else {
              var valid6 = true;
            }
            if (valid6) {
              if (data.type !== void 0) {
                let data9 = data.type;
                const _errs34 = errors;
                if (typeof data9 !== "string") {
                  const err21 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (!(data9 === "localImage")) {
                  const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[2].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                var valid6 = _errs34 === errors;
              } else {
                var valid6 = true;
              }
            }
          }
        }
      } else {
        const err23 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    var _valid0 = _errs23 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs36 = errors;
      if (errors === _errs36) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.type === void 0 && (missing3 = "type") || data.url === void 0 && (missing3 = "url")) {
            const err24 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          } else {
            if (data.type !== void 0) {
              let data10 = data.type;
              const _errs38 = errors;
              if (typeof data10 !== "string") {
                const err25 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
              if (!(data10 === "audio")) {
                const err26 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[3].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              var valid9 = _errs38 === errors;
            } else {
              var valid9 = true;
            }
            if (valid9) {
              if (data.url !== void 0) {
                const _errs40 = errors;
                if (typeof data.url !== "string") {
                  const err27 = { instancePath: instancePath + "/url", schemaPath: "#/oneOf/3/properties/url/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                var valid9 = _errs40 === errors;
              } else {
                var valid9 = true;
              }
            }
          }
        } else {
          const err28 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
      var _valid0 = _errs36 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs42 = errors;
        if (errors === _errs42) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing4;
            if (data.path === void 0 && (missing4 = "path") || data.type === void 0 && (missing4 = "type")) {
              const err29 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing4 } };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            } else {
              if (data.path !== void 0) {
                const _errs44 = errors;
                if (typeof data.path !== "string") {
                  const err30 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/4/properties/path/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
                var valid10 = _errs44 === errors;
              } else {
                var valid10 = true;
              }
              if (valid10) {
                if (data.type !== void 0) {
                  let data13 = data.type;
                  const _errs46 = errors;
                  if (typeof data13 !== "string") {
                    const err31 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                  if (!(data13 === "localAudio")) {
                    const err32 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[4].properties.type.enum } };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                  var valid10 = _errs46 === errors;
                } else {
                  var valid10 = true;
                }
              }
            }
          } else {
            const err33 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        var _valid0 = _errs42 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs48 = errors;
          if (errors === _errs48) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing5;
              if (data.name === void 0 && (missing5 = "name") || data.path === void 0 && (missing5 = "path") || data.type === void 0 && (missing5 = "type")) {
                const err34 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing5 } };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              } else {
                if (data.name !== void 0) {
                  const _errs50 = errors;
                  if (typeof data.name !== "string") {
                    const err35 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/5/properties/name/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  var valid11 = _errs50 === errors;
                } else {
                  var valid11 = true;
                }
                if (valid11) {
                  if (data.path !== void 0) {
                    const _errs52 = errors;
                    if (typeof data.path !== "string") {
                      const err36 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/5/properties/path/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err36];
                      } else {
                        vErrors.push(err36);
                      }
                      errors++;
                    }
                    var valid11 = _errs52 === errors;
                  } else {
                    var valid11 = true;
                  }
                  if (valid11) {
                    if (data.type !== void 0) {
                      let data16 = data.type;
                      const _errs54 = errors;
                      if (typeof data16 !== "string") {
                        const err37 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err37];
                        } else {
                          vErrors.push(err37);
                        }
                        errors++;
                      }
                      if (!(data16 === "skill")) {
                        const err38 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[5].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err38];
                        } else {
                          vErrors.push(err38);
                        }
                        errors++;
                      }
                      var valid11 = _errs54 === errors;
                    } else {
                      var valid11 = true;
                    }
                  }
                }
              }
            } else {
              const err39 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
          var _valid0 = _errs48 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs56 = errors;
            if (errors === _errs56) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing6;
                if (data.name === void 0 && (missing6 = "name") || data.path === void 0 && (missing6 = "path") || data.type === void 0 && (missing6 = "type")) {
                  const err40 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing6 } };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                } else {
                  if (data.name !== void 0) {
                    const _errs58 = errors;
                    if (typeof data.name !== "string") {
                      const err41 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/6/properties/name/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err41];
                      } else {
                        vErrors.push(err41);
                      }
                      errors++;
                    }
                    var valid12 = _errs58 === errors;
                  } else {
                    var valid12 = true;
                  }
                  if (valid12) {
                    if (data.path !== void 0) {
                      const _errs60 = errors;
                      if (typeof data.path !== "string") {
                        const err42 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/6/properties/path/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err42];
                        } else {
                          vErrors.push(err42);
                        }
                        errors++;
                      }
                      var valid12 = _errs60 === errors;
                    } else {
                      var valid12 = true;
                    }
                    if (valid12) {
                      if (data.type !== void 0) {
                        let data19 = data.type;
                        const _errs62 = errors;
                        if (typeof data19 !== "string") {
                          const err43 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err43];
                          } else {
                            vErrors.push(err43);
                          }
                          errors++;
                        }
                        if (!(data19 === "mention")) {
                          const err44 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[6].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err44];
                          } else {
                            vErrors.push(err44);
                          }
                          errors++;
                        }
                        var valid12 = _errs62 === errors;
                      } else {
                        var valid12 = true;
                      }
                    }
                  }
                }
              } else {
                const err45 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            var _valid0 = _errs56 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err46 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err46];
    } else {
      vErrors.push(err46);
    }
    errors++;
    validate43.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate43.errors = vErrors;
  return errors === 0;
}
function validate47(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.entries === void 0 && (missing0 = "entries") || data.threadIds === void 0 && (missing0 = "threadIds")) {
        validate47.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.entries !== void 0) {
          let data0 = data.entries;
          const _errs1 = errors;
          if (errors === _errs1) {
            if (Array.isArray(data0)) {
              var valid1 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                let data1 = data0[i0];
                const _errs3 = errors;
                const _errs4 = errors;
                if (errors === _errs4) {
                  if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                    let missing1;
                    if (data1.lineEnd === void 0 && (missing1 = "lineEnd") || data1.lineStart === void 0 && (missing1 = "lineStart") || data1.note === void 0 && (missing1 = "note") || data1.path === void 0 && (missing1 = "path")) {
                      validate47.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/required", keyword: "required", params: { missingProperty: missing1 } }];
                      return false;
                    } else {
                      if (data1.lineEnd !== void 0) {
                        let data2 = data1.lineEnd;
                        const _errs6 = errors;
                        if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                          validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        if (errors === _errs6) {
                          if (typeof data2 == "number" && isFinite(data2)) {
                            if (data2 < 0 || isNaN(data2)) {
                              validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
                              return false;
                            }
                          }
                        }
                        var valid3 = _errs6 === errors;
                      } else {
                        var valid3 = true;
                      }
                      if (valid3) {
                        if (data1.lineStart !== void 0) {
                          let data3 = data1.lineStart;
                          const _errs8 = errors;
                          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                            validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/type", keyword: "type", params: { type: "integer" } }];
                            return false;
                          }
                          if (errors === _errs8) {
                            if (typeof data3 == "number" && isFinite(data3)) {
                              if (data3 < 0 || isNaN(data3)) {
                                validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
                                return false;
                              }
                            }
                          }
                          var valid3 = _errs8 === errors;
                        } else {
                          var valid3 = true;
                        }
                        if (valid3) {
                          if (data1.note !== void 0) {
                            const _errs10 = errors;
                            if (typeof data1.note !== "string") {
                              validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/note", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/note/type", keyword: "type", params: { type: "string" } }];
                              return false;
                            }
                            var valid3 = _errs10 === errors;
                          } else {
                            var valid3 = true;
                          }
                          if (valid3) {
                            if (data1.path !== void 0) {
                              const _errs12 = errors;
                              if (typeof data1.path !== "string") {
                                validate47.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/path", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/path/type", keyword: "type", params: { type: "string" } }];
                                return false;
                              }
                              var valid3 = _errs12 === errors;
                            } else {
                              var valid3 = true;
                            }
                          }
                        }
                      }
                    }
                  } else {
                    validate47.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/type", keyword: "type", params: { type: "object" } }];
                    return false;
                  }
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate47.errors = [{ instancePath: instancePath + "/entries", schemaPath: "#/properties/entries/type", keyword: "type", params: { type: "array" } }];
              return false;
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.threadIds !== void 0) {
            let data6 = data.threadIds;
            const _errs14 = errors;
            if (errors === _errs14) {
              if (Array.isArray(data6)) {
                var valid4 = true;
                const len1 = data6.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  const _errs16 = errors;
                  if (typeof data6[i1] !== "string") {
                    validate47.errors = [{ instancePath: instancePath + "/threadIds/" + i1, schemaPath: "#/properties/threadIds/items/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid4 = _errs16 === errors;
                  if (!valid4) {
                    break;
                  }
                }
              } else {
                validate47.errors = [{ instancePath: instancePath + "/threadIds", schemaPath: "#/properties/threadIds/type", keyword: "type", params: { type: "array" } }];
                return false;
              }
            }
            var valid0 = _errs14 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate47.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate47.errors = vErrors;
  return errors === 0;
}
var schema57 = { "oneOf": [{ "properties": { "command": { "type": "string" }, "name": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["read"], "title": "ReadCommandActionType", "type": "string" } }, "required": ["command", "name", "path", "type"], "title": "ReadCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "type": { "enum": ["listFiles"], "title": "ListFilesCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "ListFilesCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "SearchCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "type": { "enum": ["unknown"], "title": "UnknownCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "UnknownCommandAction", "type": "object" }] };
function validate49(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.command === void 0 && (missing0 = "command") || data.name === void 0 && (missing0 = "name") || data.path === void 0 && (missing0 = "path") || data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.command !== void 0) {
          const _errs3 = errors;
          if (typeof data.command !== "string") {
            const err1 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/0/properties/command/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.name !== void 0) {
            const _errs5 = errors;
            if (typeof data.name !== "string") {
              const err2 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/0/properties/name/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.path !== void 0) {
              const _errs7 = errors;
              if (typeof data.path !== "string") {
                const err3 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              var valid1 = _errs7 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.type !== void 0) {
                let data3 = data.type;
                const _errs10 = errors;
                if (typeof data3 !== "string") {
                  const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (!(data3 === "read")) {
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema57.oneOf[0].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var valid1 = _errs10 === errors;
              } else {
                var valid1 = true;
              }
            }
          }
        }
      }
    } else {
      const err6 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs12 = errors;
  if (errors === _errs12) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.command === void 0 && (missing1 = "command") || data.type === void 0 && (missing1 = "type")) {
        const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      } else {
        if (data.command !== void 0) {
          const _errs14 = errors;
          if (typeof data.command !== "string") {
            const err8 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/1/properties/command/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          var valid3 = _errs14 === errors;
        } else {
          var valid3 = true;
        }
        if (valid3) {
          if (data.path !== void 0) {
            let data5 = data.path;
            const _errs16 = errors;
            if (typeof data5 !== "string" && data5 !== null) {
              const err9 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/1/properties/path/type", keyword: "type", params: { type: schema57.oneOf[1].properties.path.type } };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            var valid3 = _errs16 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data6 = data.type;
              const _errs18 = errors;
              if (typeof data6 !== "string") {
                const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data6 === "listFiles")) {
                const err11 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema57.oneOf[1].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              var valid3 = _errs18 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      }
    } else {
      const err12 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
  }
  var _valid0 = _errs12 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs20 = errors;
    if (errors === _errs20) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.command === void 0 && (missing2 = "command") || data.type === void 0 && (missing2 = "type")) {
          const err13 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        } else {
          if (data.command !== void 0) {
            const _errs22 = errors;
            if (typeof data.command !== "string") {
              const err14 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/2/properties/command/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            var valid4 = _errs22 === errors;
          } else {
            var valid4 = true;
          }
          if (valid4) {
            if (data.path !== void 0) {
              let data8 = data.path;
              const _errs24 = errors;
              if (typeof data8 !== "string" && data8 !== null) {
                const err15 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/2/properties/path/type", keyword: "type", params: { type: schema57.oneOf[2].properties.path.type } };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              var valid4 = _errs24 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.query !== void 0) {
                let data9 = data.query;
                const _errs26 = errors;
                if (typeof data9 !== "string" && data9 !== null) {
                  const err16 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/2/properties/query/type", keyword: "type", params: { type: schema57.oneOf[2].properties.query.type } };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                var valid4 = _errs26 === errors;
              } else {
                var valid4 = true;
              }
              if (valid4) {
                if (data.type !== void 0) {
                  let data10 = data.type;
                  const _errs28 = errors;
                  if (typeof data10 !== "string") {
                    const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  if (!(data10 === "search")) {
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema57.oneOf[2].properties.type.enum } };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  var valid4 = _errs28 === errors;
                } else {
                  var valid4 = true;
                }
              }
            }
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    var _valid0 = _errs20 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs30 = errors;
      if (errors === _errs30) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.command === void 0 && (missing3 = "command") || data.type === void 0 && (missing3 = "type")) {
            const err20 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          } else {
            if (data.command !== void 0) {
              const _errs32 = errors;
              if (typeof data.command !== "string") {
                const err21 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/3/properties/command/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              var valid5 = _errs32 === errors;
            } else {
              var valid5 = true;
            }
            if (valid5) {
              if (data.type !== void 0) {
                let data12 = data.type;
                const _errs34 = errors;
                if (typeof data12 !== "string") {
                  const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                if (!(data12 === "unknown")) {
                  const err23 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema57.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                var valid5 = _errs34 === errors;
              } else {
                var valid5 = true;
              }
            }
          }
        } else {
          const err24 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      var _valid0 = _errs30 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err25 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
    validate49.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate49.errors = vErrors;
  return errors === 0;
}
var schema63 = { "oneOf": [{ "properties": { "type": { "enum": ["add"], "title": "AddPatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "AddPatchChangeKind", "type": "object" }, { "properties": { "type": { "enum": ["delete"], "title": "DeletePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "DeletePatchChangeKind", "type": "object" }, { "properties": { "move_path": { "type": ["string", "null"] }, "type": { "enum": ["update"], "title": "UpdatePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "UpdatePatchChangeKind", "type": "object" }] };
function validate51(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.diff === void 0 && (missing0 = "diff") || data.kind === void 0 && (missing0 = "kind") || data.path === void 0 && (missing0 = "path")) {
        validate51.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.diff !== void 0) {
          const _errs1 = errors;
          if (typeof data.diff !== "string") {
            validate51.errors = [{ instancePath: instancePath + "/diff", schemaPath: "#/properties/diff/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.kind !== void 0) {
            let data1 = data.kind;
            const _errs3 = errors;
            const _errs5 = errors;
            let valid2 = false;
            let passing0 = null;
            const _errs6 = errors;
            if (errors === _errs6) {
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                let missing1;
                if (data1.type === void 0 && (missing1 = "type")) {
                  const err0 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/required", keyword: "required", params: { missingProperty: missing1 } };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                } else {
                  if (data1.type !== void 0) {
                    let data2 = data1.type;
                    if (typeof data2 !== "string") {
                      const err1 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err1];
                      } else {
                        vErrors.push(err1);
                      }
                      errors++;
                    }
                    if (!(data2 === "add")) {
                      const err2 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema63.oneOf[0].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err2];
                      } else {
                        vErrors.push(err2);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
            }
            var _valid0 = _errs6 === errors;
            if (_valid0) {
              valid2 = true;
              passing0 = 0;
            }
            const _errs10 = errors;
            if (errors === _errs10) {
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                let missing2;
                if (data1.type === void 0 && (missing2 = "type")) {
                  const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/required", keyword: "required", params: { missingProperty: missing2 } };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                } else {
                  if (data1.type !== void 0) {
                    let data3 = data1.type;
                    if (typeof data3 !== "string") {
                      const err5 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    if (!(data3 === "delete")) {
                      const err6 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema63.oneOf[1].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err6];
                      } else {
                        vErrors.push(err6);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            var _valid0 = _errs10 === errors;
            if (_valid0 && valid2) {
              valid2 = false;
              passing0 = [passing0, 1];
            } else {
              if (_valid0) {
                valid2 = true;
                passing0 = 1;
              }
              const _errs14 = errors;
              if (errors === _errs14) {
                if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                  let missing3;
                  if (data1.type === void 0 && (missing3 = "type")) {
                    const err8 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/required", keyword: "required", params: { missingProperty: missing3 } };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  } else {
                    if (data1.move_path !== void 0) {
                      let data4 = data1.move_path;
                      const _errs16 = errors;
                      if (typeof data4 !== "string" && data4 !== null) {
                        const err9 = { instancePath: instancePath + "/kind/move_path", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/move_path/type", keyword: "type", params: { type: schema63.oneOf[2].properties.move_path.type } };
                        if (vErrors === null) {
                          vErrors = [err9];
                        } else {
                          vErrors.push(err9);
                        }
                        errors++;
                      }
                      var valid5 = _errs16 === errors;
                    } else {
                      var valid5 = true;
                    }
                    if (valid5) {
                      if (data1.type !== void 0) {
                        let data5 = data1.type;
                        const _errs18 = errors;
                        if (typeof data5 !== "string") {
                          const err10 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err10];
                          } else {
                            vErrors.push(err10);
                          }
                          errors++;
                        }
                        if (!(data5 === "update")) {
                          const err11 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema63.oneOf[2].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err11];
                          } else {
                            vErrors.push(err11);
                          }
                          errors++;
                        }
                        var valid5 = _errs18 === errors;
                      } else {
                        var valid5 = true;
                      }
                    }
                  }
                } else {
                  const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs14 === errors;
              if (_valid0 && valid2) {
                valid2 = false;
                passing0 = [passing0, 2];
              } else {
                if (_valid0) {
                  valid2 = true;
                  passing0 = 2;
                }
              }
            }
            if (!valid2) {
              const err13 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
              validate51.errors = vErrors;
              return false;
            } else {
              errors = _errs5;
              if (vErrors !== null) {
                if (_errs5) {
                  vErrors.length = _errs5;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.path !== void 0) {
              const _errs20 = errors;
              if (typeof data.path !== "string") {
                validate51.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs20 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate51.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate51.errors = vErrors;
  return errors === 0;
}
var schema71 = { "properties": { "message": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/CollabAgentStatus" } }, "required": ["status"], "type": "object" };
var schema72 = { "enum": ["pendingInit", "running", "interrupted", "completed", "errored", "shutdown", "notFound"], "type": "string" };
function validate53(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate53.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.message !== void 0) {
          let data0 = data.message;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate53.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: schema71.properties.message.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.status !== void 0) {
            let data1 = data.status;
            const _errs3 = errors;
            if (typeof data1 !== "string") {
              validate53.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data1 === "pendingInit" || data1 === "running" || data1 === "interrupted" || data1 === "completed" || data1 === "errored" || data1 === "shutdown" || data1 === "notFound")) {
              validate53.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/enum", keyword: "enum", params: { allowedValues: schema72.enum } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate53.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate53.errors = vErrors;
  return errors === 0;
}
var func2 = require_ucs2length().default;
function validate42(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.content === void 0 && (missing0 = "content") || data.id === void 0 && (missing0 = "id") || data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.clientId !== void 0) {
          let data0 = data.clientId;
          const _errs3 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            const err1 = { instancePath: instancePath + "/clientId", schemaPath: "#/oneOf/0/properties/clientId/type", keyword: "type", params: { type: schema47.oneOf[0].properties.clientId.type } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.content !== void 0) {
            let data1 = data.content;
            const _errs5 = errors;
            if (errors === _errs5) {
              if (Array.isArray(data1)) {
                var valid2 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs7 = errors;
                  if (!validate43(data1[i0], { instancePath: instancePath + "/content/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
                    errors = vErrors.length;
                  }
                  var valid2 = _errs7 === errors;
                  if (!valid2) {
                    break;
                  }
                }
              } else {
                const err2 = { instancePath: instancePath + "/content", schemaPath: "#/oneOf/0/properties/content/type", keyword: "type", params: { type: "array" } };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
          if (valid1) {
            if (data.id !== void 0) {
              const _errs8 = errors;
              if (typeof data.id !== "string") {
                const err3 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/0/properties/id/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              var valid1 = _errs8 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.type !== void 0) {
                let data4 = data.type;
                const _errs10 = errors;
                if (typeof data4 !== "string") {
                  const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (!(data4 === "userMessage")) {
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[0].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var valid1 = _errs10 === errors;
              } else {
                var valid1 = true;
              }
            }
          }
        }
      }
    } else {
      const err6 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs12 = errors;
  if (errors === _errs12) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.fragments === void 0 && (missing1 = "fragments") || data.id === void 0 && (missing1 = "id") || data.type === void 0 && (missing1 = "type")) {
        const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      } else {
        if (data.fragments !== void 0) {
          let data5 = data.fragments;
          const _errs14 = errors;
          if (errors === _errs14) {
            if (Array.isArray(data5)) {
              var valid4 = true;
              const len1 = data5.length;
              for (let i1 = 0; i1 < len1; i1++) {
                let data6 = data5[i1];
                const _errs16 = errors;
                const _errs17 = errors;
                if (errors === _errs17) {
                  if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
                    let missing2;
                    if (data6.hookRunId === void 0 && (missing2 = "hookRunId") || data6.text === void 0 && (missing2 = "text")) {
                      const err8 = { instancePath: instancePath + "/fragments/" + i1, schemaPath: "#/definitions/v2/HookPromptFragment/required", keyword: "required", params: { missingProperty: missing2 } };
                      if (vErrors === null) {
                        vErrors = [err8];
                      } else {
                        vErrors.push(err8);
                      }
                      errors++;
                    } else {
                      if (data6.hookRunId !== void 0) {
                        const _errs19 = errors;
                        if (typeof data6.hookRunId !== "string") {
                          const err9 = { instancePath: instancePath + "/fragments/" + i1 + "/hookRunId", schemaPath: "#/definitions/v2/HookPromptFragment/properties/hookRunId/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err9];
                          } else {
                            vErrors.push(err9);
                          }
                          errors++;
                        }
                        var valid6 = _errs19 === errors;
                      } else {
                        var valid6 = true;
                      }
                      if (valid6) {
                        if (data6.text !== void 0) {
                          const _errs21 = errors;
                          if (typeof data6.text !== "string") {
                            const err10 = { instancePath: instancePath + "/fragments/" + i1 + "/text", schemaPath: "#/definitions/v2/HookPromptFragment/properties/text/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err10];
                            } else {
                              vErrors.push(err10);
                            }
                            errors++;
                          }
                          var valid6 = _errs21 === errors;
                        } else {
                          var valid6 = true;
                        }
                      }
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/fragments/" + i1, schemaPath: "#/definitions/v2/HookPromptFragment/type", keyword: "type", params: { type: "object" } };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                var valid4 = _errs16 === errors;
                if (!valid4) {
                  break;
                }
              }
            } else {
              const err12 = { instancePath: instancePath + "/fragments", schemaPath: "#/oneOf/1/properties/fragments/type", keyword: "type", params: { type: "array" } };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          var valid3 = _errs14 === errors;
        } else {
          var valid3 = true;
        }
        if (valid3) {
          if (data.id !== void 0) {
            const _errs23 = errors;
            if (typeof data.id !== "string") {
              const err13 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/1/properties/id/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            var valid3 = _errs23 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data10 = data.type;
              const _errs25 = errors;
              if (typeof data10 !== "string") {
                const err14 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              if (!(data10 === "hookPrompt")) {
                const err15 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[1].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              var valid3 = _errs25 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      }
    } else {
      const err16 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err16];
      } else {
        vErrors.push(err16);
      }
      errors++;
    }
  }
  var _valid0 = _errs12 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs27 = errors;
    if (errors === _errs27) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing3;
        if (data.id === void 0 && (missing3 = "id") || data.text === void 0 && (missing3 = "text") || data.type === void 0 && (missing3 = "type")) {
          const err17 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing3 } };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        } else {
          if (data.id !== void 0) {
            const _errs29 = errors;
            if (typeof data.id !== "string") {
              const err18 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            var valid7 = _errs29 === errors;
          } else {
            var valid7 = true;
          }
          if (valid7) {
            if (data.memoryCitation !== void 0) {
              let data12 = data.memoryCitation;
              const _errs31 = errors;
              const _errs32 = errors;
              let valid8 = false;
              const _errs33 = errors;
              if (!validate47(data12, { instancePath: instancePath + "/memoryCitation", parentData: data, parentDataProperty: "memoryCitation", rootData })) {
                vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
                errors = vErrors.length;
              }
              var _valid1 = _errs33 === errors;
              valid8 = valid8 || _valid1;
              if (!valid8) {
                const _errs34 = errors;
                if (data12 !== null) {
                  const err19 = { instancePath: instancePath + "/memoryCitation", schemaPath: "#/oneOf/2/properties/memoryCitation/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                var _valid1 = _errs34 === errors;
                valid8 = valid8 || _valid1;
              }
              if (!valid8) {
                const err20 = { instancePath: instancePath + "/memoryCitation", schemaPath: "#/oneOf/2/properties/memoryCitation/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              } else {
                errors = _errs32;
                if (vErrors !== null) {
                  if (_errs32) {
                    vErrors.length = _errs32;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid7 = _errs31 === errors;
            } else {
              var valid7 = true;
            }
            if (valid7) {
              if (data.phase !== void 0) {
                let data13 = data.phase;
                const _errs36 = errors;
                const _errs37 = errors;
                let valid9 = false;
                const _errs38 = errors;
                const _errs40 = errors;
                let valid11 = false;
                let passing1 = null;
                const _errs41 = errors;
                if (typeof data13 !== "string") {
                  const err21 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/0/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (!(data13 === "commentary")) {
                  const err22 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema56.oneOf[0].enum } };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                var _valid3 = _errs41 === errors;
                if (_valid3) {
                  valid11 = true;
                  passing1 = 0;
                }
                const _errs43 = errors;
                if (typeof data13 !== "string") {
                  const err23 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/1/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                if (!(data13 === "final_answer")) {
                  const err24 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema56.oneOf[1].enum } };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                var _valid3 = _errs43 === errors;
                if (_valid3 && valid11) {
                  valid11 = false;
                  passing1 = [passing1, 1];
                } else {
                  if (_valid3) {
                    valid11 = true;
                    passing1 = 1;
                  }
                }
                if (!valid11) {
                  const err25 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 } };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                } else {
                  errors = _errs40;
                  if (vErrors !== null) {
                    if (_errs40) {
                      vErrors.length = _errs40;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var _valid2 = _errs38 === errors;
                valid9 = valid9 || _valid2;
                if (!valid9) {
                  const _errs45 = errors;
                  if (data13 !== null) {
                    const err26 = { instancePath: instancePath + "/phase", schemaPath: "#/oneOf/2/properties/phase/anyOf/1/type", keyword: "type", params: { type: "null" } };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                  var _valid2 = _errs45 === errors;
                  valid9 = valid9 || _valid2;
                }
                if (!valid9) {
                  const err27 = { instancePath: instancePath + "/phase", schemaPath: "#/oneOf/2/properties/phase/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                } else {
                  errors = _errs37;
                  if (vErrors !== null) {
                    if (_errs37) {
                      vErrors.length = _errs37;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var valid7 = _errs36 === errors;
              } else {
                var valid7 = true;
              }
              if (valid7) {
                if (data.text !== void 0) {
                  const _errs47 = errors;
                  if (typeof data.text !== "string") {
                    const err28 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/2/properties/text/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                  var valid7 = _errs47 === errors;
                } else {
                  var valid7 = true;
                }
                if (valid7) {
                  if (data.type !== void 0) {
                    let data15 = data.type;
                    const _errs49 = errors;
                    if (typeof data15 !== "string") {
                      const err29 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err29];
                      } else {
                        vErrors.push(err29);
                      }
                      errors++;
                    }
                    if (!(data15 === "agentMessage")) {
                      const err30 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[2].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                    var valid7 = _errs49 === errors;
                  } else {
                    var valid7 = true;
                  }
                }
              }
            }
          }
        }
      } else {
        const err31 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    var _valid0 = _errs27 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs51 = errors;
      if (errors === _errs51) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing4;
          if (data.id === void 0 && (missing4 = "id") || data.text === void 0 && (missing4 = "text") || data.type === void 0 && (missing4 = "type")) {
            const err32 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing4 } };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          } else {
            if (data.id !== void 0) {
              const _errs53 = errors;
              if (typeof data.id !== "string") {
                const err33 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/3/properties/id/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              var valid12 = _errs53 === errors;
            } else {
              var valid12 = true;
            }
            if (valid12) {
              if (data.text !== void 0) {
                const _errs55 = errors;
                if (typeof data.text !== "string") {
                  const err34 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/3/properties/text/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
                var valid12 = _errs55 === errors;
              } else {
                var valid12 = true;
              }
              if (valid12) {
                if (data.type !== void 0) {
                  let data18 = data.type;
                  const _errs57 = errors;
                  if (typeof data18 !== "string") {
                    const err35 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  if (!(data18 === "plan")) {
                    const err36 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[3].properties.type.enum } };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                  var valid12 = _errs57 === errors;
                } else {
                  var valid12 = true;
                }
              }
            }
          }
        } else {
          const err37 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
      }
      var _valid0 = _errs51 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs59 = errors;
        if (errors === _errs59) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing5;
            if (data.id === void 0 && (missing5 = "id") || data.type === void 0 && (missing5 = "type")) {
              const err38 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing5 } };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            } else {
              if (data.content !== void 0) {
                let data19 = data.content;
                const _errs61 = errors;
                if (errors === _errs61) {
                  if (Array.isArray(data19)) {
                    var valid14 = true;
                    const len2 = data19.length;
                    for (let i2 = 0; i2 < len2; i2++) {
                      const _errs63 = errors;
                      if (typeof data19[i2] !== "string") {
                        const err39 = { instancePath: instancePath + "/content/" + i2, schemaPath: "#/oneOf/4/properties/content/items/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err39];
                        } else {
                          vErrors.push(err39);
                        }
                        errors++;
                      }
                      var valid14 = _errs63 === errors;
                      if (!valid14) {
                        break;
                      }
                    }
                  } else {
                    const err40 = { instancePath: instancePath + "/content", schemaPath: "#/oneOf/4/properties/content/type", keyword: "type", params: { type: "array" } };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
                var valid13 = _errs61 === errors;
              } else {
                var valid13 = true;
              }
              if (valid13) {
                if (data.id !== void 0) {
                  const _errs65 = errors;
                  if (typeof data.id !== "string") {
                    const err41 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/4/properties/id/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  var valid13 = _errs65 === errors;
                } else {
                  var valid13 = true;
                }
                if (valid13) {
                  if (data.summary !== void 0) {
                    let data22 = data.summary;
                    const _errs67 = errors;
                    if (errors === _errs67) {
                      if (Array.isArray(data22)) {
                        var valid15 = true;
                        const len3 = data22.length;
                        for (let i3 = 0; i3 < len3; i3++) {
                          const _errs69 = errors;
                          if (typeof data22[i3] !== "string") {
                            const err42 = { instancePath: instancePath + "/summary/" + i3, schemaPath: "#/oneOf/4/properties/summary/items/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err42];
                            } else {
                              vErrors.push(err42);
                            }
                            errors++;
                          }
                          var valid15 = _errs69 === errors;
                          if (!valid15) {
                            break;
                          }
                        }
                      } else {
                        const err43 = { instancePath: instancePath + "/summary", schemaPath: "#/oneOf/4/properties/summary/type", keyword: "type", params: { type: "array" } };
                        if (vErrors === null) {
                          vErrors = [err43];
                        } else {
                          vErrors.push(err43);
                        }
                        errors++;
                      }
                    }
                    var valid13 = _errs67 === errors;
                  } else {
                    var valid13 = true;
                  }
                  if (valid13) {
                    if (data.type !== void 0) {
                      let data24 = data.type;
                      const _errs71 = errors;
                      if (typeof data24 !== "string") {
                        const err44 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err44];
                        } else {
                          vErrors.push(err44);
                        }
                        errors++;
                      }
                      if (!(data24 === "reasoning")) {
                        const err45 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[4].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err45];
                        } else {
                          vErrors.push(err45);
                        }
                        errors++;
                      }
                      var valid13 = _errs71 === errors;
                    } else {
                      var valid13 = true;
                    }
                  }
                }
              }
            }
          } else {
            const err46 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
        var _valid0 = _errs59 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs73 = errors;
          if (errors === _errs73) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing6;
              if (data.command === void 0 && (missing6 = "command") || data.commandActions === void 0 && (missing6 = "commandActions") || data.cwd === void 0 && (missing6 = "cwd") || data.id === void 0 && (missing6 = "id") || data.status === void 0 && (missing6 = "status") || data.type === void 0 && (missing6 = "type")) {
                const err47 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing6 } };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              } else {
                if (data.aggregatedOutput !== void 0) {
                  let data25 = data.aggregatedOutput;
                  const _errs75 = errors;
                  if (typeof data25 !== "string" && data25 !== null) {
                    const err48 = { instancePath: instancePath + "/aggregatedOutput", schemaPath: "#/oneOf/5/properties/aggregatedOutput/type", keyword: "type", params: { type: schema47.oneOf[5].properties.aggregatedOutput.type } };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                  var valid16 = _errs75 === errors;
                } else {
                  var valid16 = true;
                }
                if (valid16) {
                  if (data.command !== void 0) {
                    const _errs77 = errors;
                    if (typeof data.command !== "string") {
                      const err49 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/5/properties/command/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    var valid16 = _errs77 === errors;
                  } else {
                    var valid16 = true;
                  }
                  if (valid16) {
                    if (data.commandActions !== void 0) {
                      let data27 = data.commandActions;
                      const _errs79 = errors;
                      if (errors === _errs79) {
                        if (Array.isArray(data27)) {
                          var valid17 = true;
                          const len4 = data27.length;
                          for (let i4 = 0; i4 < len4; i4++) {
                            const _errs81 = errors;
                            if (!validate49(data27[i4], { instancePath: instancePath + "/commandActions/" + i4, parentData: data27, parentDataProperty: i4, rootData })) {
                              vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
                              errors = vErrors.length;
                            }
                            var valid17 = _errs81 === errors;
                            if (!valid17) {
                              break;
                            }
                          }
                        } else {
                          const err50 = { instancePath: instancePath + "/commandActions", schemaPath: "#/oneOf/5/properties/commandActions/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err50];
                          } else {
                            vErrors.push(err50);
                          }
                          errors++;
                        }
                      }
                      var valid16 = _errs79 === errors;
                    } else {
                      var valid16 = true;
                    }
                    if (valid16) {
                      if (data.cwd !== void 0) {
                        const _errs82 = errors;
                        if (typeof data.cwd !== "string") {
                          const err51 = { instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err51];
                          } else {
                            vErrors.push(err51);
                          }
                          errors++;
                        }
                        var valid16 = _errs82 === errors;
                      } else {
                        var valid16 = true;
                      }
                      if (valid16) {
                        if (data.durationMs !== void 0) {
                          let data30 = data.durationMs;
                          const _errs86 = errors;
                          if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30)) && data30 !== null) {
                            const err52 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/5/properties/durationMs/type", keyword: "type", params: { type: schema47.oneOf[5].properties.durationMs.type } };
                            if (vErrors === null) {
                              vErrors = [err52];
                            } else {
                              vErrors.push(err52);
                            }
                            errors++;
                          }
                          var valid16 = _errs86 === errors;
                        } else {
                          var valid16 = true;
                        }
                        if (valid16) {
                          if (data.exitCode !== void 0) {
                            let data31 = data.exitCode;
                            const _errs88 = errors;
                            if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31)) && data31 !== null) {
                              const err53 = { instancePath: instancePath + "/exitCode", schemaPath: "#/oneOf/5/properties/exitCode/type", keyword: "type", params: { type: schema47.oneOf[5].properties.exitCode.type } };
                              if (vErrors === null) {
                                vErrors = [err53];
                              } else {
                                vErrors.push(err53);
                              }
                              errors++;
                            }
                            var valid16 = _errs88 === errors;
                          } else {
                            var valid16 = true;
                          }
                          if (valid16) {
                            if (data.id !== void 0) {
                              const _errs90 = errors;
                              if (typeof data.id !== "string") {
                                const err54 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/5/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err54];
                                } else {
                                  vErrors.push(err54);
                                }
                                errors++;
                              }
                              var valid16 = _errs90 === errors;
                            } else {
                              var valid16 = true;
                            }
                            if (valid16) {
                              if (data.pluginId !== void 0) {
                                let data33 = data.pluginId;
                                const _errs92 = errors;
                                if (typeof data33 !== "string" && data33 !== null) {
                                  const err55 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/5/properties/pluginId/type", keyword: "type", params: { type: schema47.oneOf[5].properties.pluginId.type } };
                                  if (vErrors === null) {
                                    vErrors = [err55];
                                  } else {
                                    vErrors.push(err55);
                                  }
                                  errors++;
                                }
                                var valid16 = _errs92 === errors;
                              } else {
                                var valid16 = true;
                              }
                              if (valid16) {
                                if (data.processId !== void 0) {
                                  let data34 = data.processId;
                                  const _errs94 = errors;
                                  if (typeof data34 !== "string" && data34 !== null) {
                                    const err56 = { instancePath: instancePath + "/processId", schemaPath: "#/oneOf/5/properties/processId/type", keyword: "type", params: { type: schema47.oneOf[5].properties.processId.type } };
                                    if (vErrors === null) {
                                      vErrors = [err56];
                                    } else {
                                      vErrors.push(err56);
                                    }
                                    errors++;
                                  }
                                  var valid16 = _errs94 === errors;
                                } else {
                                  var valid16 = true;
                                }
                                if (valid16) {
                                  if (data.scriptPath !== void 0) {
                                    let data35 = data.scriptPath;
                                    const _errs96 = errors;
                                    if (typeof data35 !== "string" && data35 !== null) {
                                      const err57 = { instancePath: instancePath + "/scriptPath", schemaPath: "#/oneOf/5/properties/scriptPath/type", keyword: "type", params: { type: schema47.oneOf[5].properties.scriptPath.type } };
                                      if (vErrors === null) {
                                        vErrors = [err57];
                                      } else {
                                        vErrors.push(err57);
                                      }
                                      errors++;
                                    }
                                    var valid16 = _errs96 === errors;
                                  } else {
                                    var valid16 = true;
                                  }
                                  if (valid16) {
                                    if (data.source !== void 0) {
                                      let data36 = data.source;
                                      const _errs98 = errors;
                                      if (typeof data36 !== "string") {
                                        const err58 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err58];
                                        } else {
                                          vErrors.push(err58);
                                        }
                                        errors++;
                                      }
                                      if (!(data36 === "agent" || data36 === "userShell" || data36 === "unifiedExecStartup" || data36 === "unifiedExecInteraction")) {
                                        const err59 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/enum", keyword: "enum", params: { allowedValues: schema60.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err59];
                                        } else {
                                          vErrors.push(err59);
                                        }
                                        errors++;
                                      }
                                      var valid16 = _errs98 === errors;
                                    } else {
                                      var valid16 = true;
                                    }
                                    if (valid16) {
                                      if (data.status !== void 0) {
                                        let data37 = data.status;
                                        const _errs102 = errors;
                                        if (typeof data37 !== "string") {
                                          const err60 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err60];
                                          } else {
                                            vErrors.push(err60);
                                          }
                                          errors++;
                                        }
                                        if (!(data37 === "inProgress" || data37 === "completed" || data37 === "failed" || data37 === "declined")) {
                                          const err61 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/enum", keyword: "enum", params: { allowedValues: schema61.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err61];
                                          } else {
                                            vErrors.push(err61);
                                          }
                                          errors++;
                                        }
                                        var valid16 = _errs102 === errors;
                                      } else {
                                        var valid16 = true;
                                      }
                                      if (valid16) {
                                        if (data.type !== void 0) {
                                          let data38 = data.type;
                                          const _errs105 = errors;
                                          if (typeof data38 !== "string") {
                                            const err62 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err62];
                                            } else {
                                              vErrors.push(err62);
                                            }
                                            errors++;
                                          }
                                          if (!(data38 === "commandExecution")) {
                                            const err63 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[5].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err63];
                                            } else {
                                              vErrors.push(err63);
                                            }
                                            errors++;
                                          }
                                          var valid16 = _errs105 === errors;
                                        } else {
                                          var valid16 = true;
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            } else {
              const err64 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err64];
              } else {
                vErrors.push(err64);
              }
              errors++;
            }
          }
          var _valid0 = _errs73 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs107 = errors;
            if (errors === _errs107) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing7;
                if (data.changes === void 0 && (missing7 = "changes") || data.id === void 0 && (missing7 = "id") || data.status === void 0 && (missing7 = "status") || data.type === void 0 && (missing7 = "type")) {
                  const err65 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing7 } };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                } else {
                  if (data.changes !== void 0) {
                    let data39 = data.changes;
                    const _errs109 = errors;
                    if (errors === _errs109) {
                      if (Array.isArray(data39)) {
                        var valid24 = true;
                        const len5 = data39.length;
                        for (let i5 = 0; i5 < len5; i5++) {
                          const _errs111 = errors;
                          if (!validate51(data39[i5], { instancePath: instancePath + "/changes/" + i5, parentData: data39, parentDataProperty: i5, rootData })) {
                            vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
                            errors = vErrors.length;
                          }
                          var valid24 = _errs111 === errors;
                          if (!valid24) {
                            break;
                          }
                        }
                      } else {
                        const err66 = { instancePath: instancePath + "/changes", schemaPath: "#/oneOf/6/properties/changes/type", keyword: "type", params: { type: "array" } };
                        if (vErrors === null) {
                          vErrors = [err66];
                        } else {
                          vErrors.push(err66);
                        }
                        errors++;
                      }
                    }
                    var valid23 = _errs109 === errors;
                  } else {
                    var valid23 = true;
                  }
                  if (valid23) {
                    if (data.id !== void 0) {
                      const _errs112 = errors;
                      if (typeof data.id !== "string") {
                        const err67 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/6/properties/id/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err67];
                        } else {
                          vErrors.push(err67);
                        }
                        errors++;
                      }
                      var valid23 = _errs112 === errors;
                    } else {
                      var valid23 = true;
                    }
                    if (valid23) {
                      if (data.status !== void 0) {
                        let data42 = data.status;
                        const _errs114 = errors;
                        if (typeof data42 !== "string") {
                          const err68 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err68];
                          } else {
                            vErrors.push(err68);
                          }
                          errors++;
                        }
                        if (!(data42 === "inProgress" || data42 === "completed" || data42 === "failed" || data42 === "declined")) {
                          const err69 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/enum", keyword: "enum", params: { allowedValues: schema64.enum } };
                          if (vErrors === null) {
                            vErrors = [err69];
                          } else {
                            vErrors.push(err69);
                          }
                          errors++;
                        }
                        var valid23 = _errs114 === errors;
                      } else {
                        var valid23 = true;
                      }
                      if (valid23) {
                        if (data.type !== void 0) {
                          let data43 = data.type;
                          const _errs117 = errors;
                          if (typeof data43 !== "string") {
                            const err70 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err70];
                            } else {
                              vErrors.push(err70);
                            }
                            errors++;
                          }
                          if (!(data43 === "fileChange")) {
                            const err71 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[6].properties.type.enum } };
                            if (vErrors === null) {
                              vErrors = [err71];
                            } else {
                              vErrors.push(err71);
                            }
                            errors++;
                          }
                          var valid23 = _errs117 === errors;
                        } else {
                          var valid23 = true;
                        }
                      }
                    }
                  }
                }
              } else {
                const err72 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err72];
                } else {
                  vErrors.push(err72);
                }
                errors++;
              }
            }
            var _valid0 = _errs107 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
              const _errs119 = errors;
              if (errors === _errs119) {
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  let missing8;
                  if (data.arguments === void 0 && (missing8 = "arguments") || data.id === void 0 && (missing8 = "id") || data.server === void 0 && (missing8 = "server") || data.status === void 0 && (missing8 = "status") || data.tool === void 0 && (missing8 = "tool") || data.type === void 0 && (missing8 = "type")) {
                    const err73 = { instancePath, schemaPath: "#/oneOf/7/required", keyword: "required", params: { missingProperty: missing8 } };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  } else {
                    if (data.appContext !== void 0) {
                      let data44 = data.appContext;
                      const _errs121 = errors;
                      const _errs122 = errors;
                      let valid27 = false;
                      const _errs123 = errors;
                      const _errs124 = errors;
                      if (errors === _errs124) {
                        if (data44 && typeof data44 == "object" && !Array.isArray(data44)) {
                          let missing9;
                          if (data44.connectorId === void 0 && (missing9 = "connectorId")) {
                            const err74 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/required", keyword: "required", params: { missingProperty: missing9 } };
                            if (vErrors === null) {
                              vErrors = [err74];
                            } else {
                              vErrors.push(err74);
                            }
                            errors++;
                          } else {
                            if (data44.actionName !== void 0) {
                              let data45 = data44.actionName;
                              const _errs126 = errors;
                              if (typeof data45 !== "string" && data45 !== null) {
                                const err75 = { instancePath: instancePath + "/appContext/actionName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/actionName/type", keyword: "type", params: { type: schema65.properties.actionName.type } };
                                if (vErrors === null) {
                                  vErrors = [err75];
                                } else {
                                  vErrors.push(err75);
                                }
                                errors++;
                              }
                              var valid29 = _errs126 === errors;
                            } else {
                              var valid29 = true;
                            }
                            if (valid29) {
                              if (data44.appName !== void 0) {
                                let data46 = data44.appName;
                                const _errs128 = errors;
                                if (typeof data46 !== "string" && data46 !== null) {
                                  const err76 = { instancePath: instancePath + "/appContext/appName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/appName/type", keyword: "type", params: { type: schema65.properties.appName.type } };
                                  if (vErrors === null) {
                                    vErrors = [err76];
                                  } else {
                                    vErrors.push(err76);
                                  }
                                  errors++;
                                }
                                var valid29 = _errs128 === errors;
                              } else {
                                var valid29 = true;
                              }
                              if (valid29) {
                                if (data44.connectorId !== void 0) {
                                  const _errs130 = errors;
                                  if (typeof data44.connectorId !== "string") {
                                    const err77 = { instancePath: instancePath + "/appContext/connectorId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/connectorId/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err77];
                                    } else {
                                      vErrors.push(err77);
                                    }
                                    errors++;
                                  }
                                  var valid29 = _errs130 === errors;
                                } else {
                                  var valid29 = true;
                                }
                                if (valid29) {
                                  if (data44.linkId !== void 0) {
                                    let data48 = data44.linkId;
                                    const _errs132 = errors;
                                    if (typeof data48 !== "string" && data48 !== null) {
                                      const err78 = { instancePath: instancePath + "/appContext/linkId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/linkId/type", keyword: "type", params: { type: schema65.properties.linkId.type } };
                                      if (vErrors === null) {
                                        vErrors = [err78];
                                      } else {
                                        vErrors.push(err78);
                                      }
                                      errors++;
                                    }
                                    var valid29 = _errs132 === errors;
                                  } else {
                                    var valid29 = true;
                                  }
                                  if (valid29) {
                                    if (data44.resourceUri !== void 0) {
                                      let data49 = data44.resourceUri;
                                      const _errs134 = errors;
                                      if (typeof data49 !== "string" && data49 !== null) {
                                        const err79 = { instancePath: instancePath + "/appContext/resourceUri", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/resourceUri/type", keyword: "type", params: { type: schema65.properties.resourceUri.type } };
                                        if (vErrors === null) {
                                          vErrors = [err79];
                                        } else {
                                          vErrors.push(err79);
                                        }
                                        errors++;
                                      }
                                      var valid29 = _errs134 === errors;
                                    } else {
                                      var valid29 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          const err80 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/type", keyword: "type", params: { type: "object" } };
                          if (vErrors === null) {
                            vErrors = [err80];
                          } else {
                            vErrors.push(err80);
                          }
                          errors++;
                        }
                      }
                      var _valid4 = _errs123 === errors;
                      valid27 = valid27 || _valid4;
                      if (!valid27) {
                        const _errs136 = errors;
                        if (data44 !== null) {
                          const err81 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/7/properties/appContext/anyOf/1/type", keyword: "type", params: { type: "null" } };
                          if (vErrors === null) {
                            vErrors = [err81];
                          } else {
                            vErrors.push(err81);
                          }
                          errors++;
                        }
                        var _valid4 = _errs136 === errors;
                        valid27 = valid27 || _valid4;
                      }
                      if (!valid27) {
                        const err82 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/7/properties/appContext/anyOf", keyword: "anyOf", params: {} };
                        if (vErrors === null) {
                          vErrors = [err82];
                        } else {
                          vErrors.push(err82);
                        }
                        errors++;
                      } else {
                        errors = _errs122;
                        if (vErrors !== null) {
                          if (_errs122) {
                            vErrors.length = _errs122;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                      var valid26 = _errs121 === errors;
                    } else {
                      var valid26 = true;
                    }
                    if (valid26) {
                      if (data.durationMs !== void 0) {
                        let data50 = data.durationMs;
                        const _errs138 = errors;
                        if (!(typeof data50 == "number" && (!(data50 % 1) && !isNaN(data50)) && isFinite(data50)) && data50 !== null) {
                          const err83 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/7/properties/durationMs/type", keyword: "type", params: { type: schema47.oneOf[7].properties.durationMs.type } };
                          if (vErrors === null) {
                            vErrors = [err83];
                          } else {
                            vErrors.push(err83);
                          }
                          errors++;
                        }
                        var valid26 = _errs138 === errors;
                      } else {
                        var valid26 = true;
                      }
                      if (valid26) {
                        if (data.error !== void 0) {
                          let data51 = data.error;
                          const _errs140 = errors;
                          const _errs141 = errors;
                          let valid30 = false;
                          const _errs142 = errors;
                          const _errs143 = errors;
                          if (errors === _errs143) {
                            if (data51 && typeof data51 == "object" && !Array.isArray(data51)) {
                              let missing10;
                              if (data51.message === void 0 && (missing10 = "message")) {
                                const err84 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/required", keyword: "required", params: { missingProperty: missing10 } };
                                if (vErrors === null) {
                                  vErrors = [err84];
                                } else {
                                  vErrors.push(err84);
                                }
                                errors++;
                              } else {
                                if (data51.message !== void 0) {
                                  if (typeof data51.message !== "string") {
                                    const err85 = { instancePath: instancePath + "/error/message", schemaPath: "#/definitions/v2/McpToolCallError/properties/message/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err85];
                                    } else {
                                      vErrors.push(err85);
                                    }
                                    errors++;
                                  }
                                }
                              }
                            } else {
                              const err86 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err86];
                              } else {
                                vErrors.push(err86);
                              }
                              errors++;
                            }
                          }
                          var _valid5 = _errs142 === errors;
                          valid30 = valid30 || _valid5;
                          if (!valid30) {
                            const _errs147 = errors;
                            if (data51 !== null) {
                              const err87 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/7/properties/error/anyOf/1/type", keyword: "type", params: { type: "null" } };
                              if (vErrors === null) {
                                vErrors = [err87];
                              } else {
                                vErrors.push(err87);
                              }
                              errors++;
                            }
                            var _valid5 = _errs147 === errors;
                            valid30 = valid30 || _valid5;
                          }
                          if (!valid30) {
                            const err88 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/7/properties/error/anyOf", keyword: "anyOf", params: {} };
                            if (vErrors === null) {
                              vErrors = [err88];
                            } else {
                              vErrors.push(err88);
                            }
                            errors++;
                          } else {
                            errors = _errs141;
                            if (vErrors !== null) {
                              if (_errs141) {
                                vErrors.length = _errs141;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                          var valid26 = _errs140 === errors;
                        } else {
                          var valid26 = true;
                        }
                        if (valid26) {
                          if (data.id !== void 0) {
                            const _errs149 = errors;
                            if (typeof data.id !== "string") {
                              const err89 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/7/properties/id/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err89];
                              } else {
                                vErrors.push(err89);
                              }
                              errors++;
                            }
                            var valid26 = _errs149 === errors;
                          } else {
                            var valid26 = true;
                          }
                          if (valid26) {
                            if (data.mcpAppResourceUri !== void 0) {
                              let data54 = data.mcpAppResourceUri;
                              const _errs151 = errors;
                              if (typeof data54 !== "string" && data54 !== null) {
                                const err90 = { instancePath: instancePath + "/mcpAppResourceUri", schemaPath: "#/oneOf/7/properties/mcpAppResourceUri/type", keyword: "type", params: { type: schema47.oneOf[7].properties.mcpAppResourceUri.type } };
                                if (vErrors === null) {
                                  vErrors = [err90];
                                } else {
                                  vErrors.push(err90);
                                }
                                errors++;
                              }
                              var valid26 = _errs151 === errors;
                            } else {
                              var valid26 = true;
                            }
                            if (valid26) {
                              if (data.pluginId !== void 0) {
                                let data55 = data.pluginId;
                                const _errs153 = errors;
                                if (typeof data55 !== "string" && data55 !== null) {
                                  const err91 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/7/properties/pluginId/type", keyword: "type", params: { type: schema47.oneOf[7].properties.pluginId.type } };
                                  if (vErrors === null) {
                                    vErrors = [err91];
                                  } else {
                                    vErrors.push(err91);
                                  }
                                  errors++;
                                }
                                var valid26 = _errs153 === errors;
                              } else {
                                var valid26 = true;
                              }
                              if (valid26) {
                                if (data.readOnlyHint !== void 0) {
                                  let data56 = data.readOnlyHint;
                                  const _errs155 = errors;
                                  if (typeof data56 !== "boolean" && data56 !== null) {
                                    const err92 = { instancePath: instancePath + "/readOnlyHint", schemaPath: "#/oneOf/7/properties/readOnlyHint/type", keyword: "type", params: { type: schema47.oneOf[7].properties.readOnlyHint.type } };
                                    if (vErrors === null) {
                                      vErrors = [err92];
                                    } else {
                                      vErrors.push(err92);
                                    }
                                    errors++;
                                  }
                                  var valid26 = _errs155 === errors;
                                } else {
                                  var valid26 = true;
                                }
                                if (valid26) {
                                  if (data.result !== void 0) {
                                    let data57 = data.result;
                                    const _errs157 = errors;
                                    const _errs158 = errors;
                                    let valid33 = false;
                                    const _errs159 = errors;
                                    const _errs160 = errors;
                                    if (errors === _errs160) {
                                      if (data57 && typeof data57 == "object" && !Array.isArray(data57)) {
                                        let missing11;
                                        if (data57.content === void 0 && (missing11 = "content")) {
                                          const err93 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/required", keyword: "required", params: { missingProperty: missing11 } };
                                          if (vErrors === null) {
                                            vErrors = [err93];
                                          } else {
                                            vErrors.push(err93);
                                          }
                                          errors++;
                                        } else {
                                          if (data57.content !== void 0) {
                                            const _errs162 = errors;
                                            if (errors === _errs162) {
                                              if (!Array.isArray(data57.content)) {
                                                const err94 = { instancePath: instancePath + "/result/content", schemaPath: "#/definitions/v2/McpToolCallResult/properties/content/type", keyword: "type", params: { type: "array" } };
                                                if (vErrors === null) {
                                                  vErrors = [err94];
                                                } else {
                                                  vErrors.push(err94);
                                                }
                                                errors++;
                                              }
                                            }
                                          }
                                        }
                                      } else {
                                        const err95 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err95];
                                        } else {
                                          vErrors.push(err95);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid6 = _errs159 === errors;
                                    valid33 = valid33 || _valid6;
                                    if (!valid33) {
                                      const _errs164 = errors;
                                      if (data57 !== null) {
                                        const err96 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/7/properties/result/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                        if (vErrors === null) {
                                          vErrors = [err96];
                                        } else {
                                          vErrors.push(err96);
                                        }
                                        errors++;
                                      }
                                      var _valid6 = _errs164 === errors;
                                      valid33 = valid33 || _valid6;
                                    }
                                    if (!valid33) {
                                      const err97 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/7/properties/result/anyOf", keyword: "anyOf", params: {} };
                                      if (vErrors === null) {
                                        vErrors = [err97];
                                      } else {
                                        vErrors.push(err97);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs158;
                                      if (vErrors !== null) {
                                        if (_errs158) {
                                          vErrors.length = _errs158;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid26 = _errs157 === errors;
                                  } else {
                                    var valid26 = true;
                                  }
                                  if (valid26) {
                                    if (data.server !== void 0) {
                                      const _errs166 = errors;
                                      if (typeof data.server !== "string") {
                                        const err98 = { instancePath: instancePath + "/server", schemaPath: "#/oneOf/7/properties/server/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err98];
                                        } else {
                                          vErrors.push(err98);
                                        }
                                        errors++;
                                      }
                                      var valid26 = _errs166 === errors;
                                    } else {
                                      var valid26 = true;
                                    }
                                    if (valid26) {
                                      if (data.status !== void 0) {
                                        let data60 = data.status;
                                        const _errs168 = errors;
                                        if (typeof data60 !== "string") {
                                          const err99 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err99];
                                          } else {
                                            vErrors.push(err99);
                                          }
                                          errors++;
                                        }
                                        if (!(data60 === "inProgress" || data60 === "completed" || data60 === "failed")) {
                                          const err100 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema68.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err100];
                                          } else {
                                            vErrors.push(err100);
                                          }
                                          errors++;
                                        }
                                        var valid26 = _errs168 === errors;
                                      } else {
                                        var valid26 = true;
                                      }
                                      if (valid26) {
                                        if (data.tool !== void 0) {
                                          const _errs171 = errors;
                                          if (typeof data.tool !== "string") {
                                            const err101 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/7/properties/tool/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err101];
                                            } else {
                                              vErrors.push(err101);
                                            }
                                            errors++;
                                          }
                                          var valid26 = _errs171 === errors;
                                        } else {
                                          var valid26 = true;
                                        }
                                        if (valid26) {
                                          if (data.type !== void 0) {
                                            let data62 = data.type;
                                            const _errs173 = errors;
                                            if (typeof data62 !== "string") {
                                              const err102 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err102];
                                              } else {
                                                vErrors.push(err102);
                                              }
                                              errors++;
                                            }
                                            if (!(data62 === "mcpToolCall")) {
                                              const err103 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[7].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err103];
                                              } else {
                                                vErrors.push(err103);
                                              }
                                              errors++;
                                            }
                                            var valid26 = _errs173 === errors;
                                          } else {
                                            var valid26 = true;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  const err104 = { instancePath, schemaPath: "#/oneOf/7/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err104];
                  } else {
                    vErrors.push(err104);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs119 === errors;
              if (_valid0 && valid0) {
                valid0 = false;
                passing0 = [passing0, 7];
              } else {
                if (_valid0) {
                  valid0 = true;
                  passing0 = 7;
                }
                const _errs175 = errors;
                if (errors === _errs175) {
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    let missing12;
                    if (data.arguments === void 0 && (missing12 = "arguments") || data.id === void 0 && (missing12 = "id") || data.status === void 0 && (missing12 = "status") || data.tool === void 0 && (missing12 = "tool") || data.type === void 0 && (missing12 = "type")) {
                      const err105 = { instancePath, schemaPath: "#/oneOf/8/required", keyword: "required", params: { missingProperty: missing12 } };
                      if (vErrors === null) {
                        vErrors = [err105];
                      } else {
                        vErrors.push(err105);
                      }
                      errors++;
                    } else {
                      if (data.contentItems !== void 0) {
                        let data63 = data.contentItems;
                        const _errs177 = errors;
                        if (!Array.isArray(data63) && data63 !== null) {
                          const err106 = { instancePath: instancePath + "/contentItems", schemaPath: "#/oneOf/8/properties/contentItems/type", keyword: "type", params: { type: schema47.oneOf[8].properties.contentItems.type } };
                          if (vErrors === null) {
                            vErrors = [err106];
                          } else {
                            vErrors.push(err106);
                          }
                          errors++;
                        }
                        if (errors === _errs177) {
                          if (Array.isArray(data63)) {
                            var valid38 = true;
                            const len6 = data63.length;
                            for (let i6 = 0; i6 < len6; i6++) {
                              let data64 = data63[i6];
                              const _errs179 = errors;
                              const _errs181 = errors;
                              let valid40 = false;
                              let passing2 = null;
                              const _errs182 = errors;
                              if (errors === _errs182) {
                                if (data64 && typeof data64 == "object" && !Array.isArray(data64)) {
                                  let missing13;
                                  if (data64.text === void 0 && (missing13 = "text") || data64.type === void 0 && (missing13 = "type")) {
                                    const err107 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/required", keyword: "required", params: { missingProperty: missing13 } };
                                    if (vErrors === null) {
                                      vErrors = [err107];
                                    } else {
                                      vErrors.push(err107);
                                    }
                                    errors++;
                                  } else {
                                    if (data64.text !== void 0) {
                                      const _errs184 = errors;
                                      if (typeof data64.text !== "string") {
                                        const err108 = { instancePath: instancePath + "/contentItems/" + i6 + "/text", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/text/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err108];
                                        } else {
                                          vErrors.push(err108);
                                        }
                                        errors++;
                                      }
                                      var valid41 = _errs184 === errors;
                                    } else {
                                      var valid41 = true;
                                    }
                                    if (valid41) {
                                      if (data64.type !== void 0) {
                                        let data66 = data64.type;
                                        const _errs186 = errors;
                                        if (typeof data66 !== "string") {
                                          const err109 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err109];
                                          } else {
                                            vErrors.push(err109);
                                          }
                                          errors++;
                                        }
                                        if (!(data66 === "inputText")) {
                                          const err110 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema69.oneOf[0].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err110];
                                          } else {
                                            vErrors.push(err110);
                                          }
                                          errors++;
                                        }
                                        var valid41 = _errs186 === errors;
                                      } else {
                                        var valid41 = true;
                                      }
                                    }
                                  }
                                } else {
                                  const err111 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err111];
                                  } else {
                                    vErrors.push(err111);
                                  }
                                  errors++;
                                }
                              }
                              var _valid7 = _errs182 === errors;
                              if (_valid7) {
                                valid40 = true;
                                passing2 = 0;
                              }
                              const _errs188 = errors;
                              if (errors === _errs188) {
                                if (data64 && typeof data64 == "object" && !Array.isArray(data64)) {
                                  let missing14;
                                  if (data64.imageUrl === void 0 && (missing14 = "imageUrl") || data64.type === void 0 && (missing14 = "type")) {
                                    const err112 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/required", keyword: "required", params: { missingProperty: missing14 } };
                                    if (vErrors === null) {
                                      vErrors = [err112];
                                    } else {
                                      vErrors.push(err112);
                                    }
                                    errors++;
                                  } else {
                                    if (data64.imageUrl !== void 0) {
                                      const _errs190 = errors;
                                      if (typeof data64.imageUrl !== "string") {
                                        const err113 = { instancePath: instancePath + "/contentItems/" + i6 + "/imageUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/imageUrl/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err113];
                                        } else {
                                          vErrors.push(err113);
                                        }
                                        errors++;
                                      }
                                      var valid42 = _errs190 === errors;
                                    } else {
                                      var valid42 = true;
                                    }
                                    if (valid42) {
                                      if (data64.type !== void 0) {
                                        let data68 = data64.type;
                                        const _errs192 = errors;
                                        if (typeof data68 !== "string") {
                                          const err114 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err114];
                                          } else {
                                            vErrors.push(err114);
                                          }
                                          errors++;
                                        }
                                        if (!(data68 === "inputImage")) {
                                          const err115 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema69.oneOf[1].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err115];
                                          } else {
                                            vErrors.push(err115);
                                          }
                                          errors++;
                                        }
                                        var valid42 = _errs192 === errors;
                                      } else {
                                        var valid42 = true;
                                      }
                                    }
                                  }
                                } else {
                                  const err116 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err116];
                                  } else {
                                    vErrors.push(err116);
                                  }
                                  errors++;
                                }
                              }
                              var _valid7 = _errs188 === errors;
                              if (_valid7 && valid40) {
                                valid40 = false;
                                passing2 = [passing2, 1];
                              } else {
                                if (_valid7) {
                                  valid40 = true;
                                  passing2 = 1;
                                }
                                const _errs194 = errors;
                                if (errors === _errs194) {
                                  if (data64 && typeof data64 == "object" && !Array.isArray(data64)) {
                                    let missing15;
                                    if (data64.audioUrl === void 0 && (missing15 = "audioUrl") || data64.type === void 0 && (missing15 = "type")) {
                                      const err117 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/required", keyword: "required", params: { missingProperty: missing15 } };
                                      if (vErrors === null) {
                                        vErrors = [err117];
                                      } else {
                                        vErrors.push(err117);
                                      }
                                      errors++;
                                    } else {
                                      if (data64.audioUrl !== void 0) {
                                        const _errs196 = errors;
                                        if (typeof data64.audioUrl !== "string") {
                                          const err118 = { instancePath: instancePath + "/contentItems/" + i6 + "/audioUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/audioUrl/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err118];
                                          } else {
                                            vErrors.push(err118);
                                          }
                                          errors++;
                                        }
                                        var valid43 = _errs196 === errors;
                                      } else {
                                        var valid43 = true;
                                      }
                                      if (valid43) {
                                        if (data64.type !== void 0) {
                                          let data70 = data64.type;
                                          const _errs198 = errors;
                                          if (typeof data70 !== "string") {
                                            const err119 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err119];
                                            } else {
                                              vErrors.push(err119);
                                            }
                                            errors++;
                                          }
                                          if (!(data70 === "inputAudio")) {
                                            const err120 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema69.oneOf[2].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err120];
                                            } else {
                                              vErrors.push(err120);
                                            }
                                            errors++;
                                          }
                                          var valid43 = _errs198 === errors;
                                        } else {
                                          var valid43 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err121 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err121];
                                    } else {
                                      vErrors.push(err121);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid7 = _errs194 === errors;
                                if (_valid7 && valid40) {
                                  valid40 = false;
                                  passing2 = [passing2, 2];
                                } else {
                                  if (_valid7) {
                                    valid40 = true;
                                    passing2 = 2;
                                  }
                                }
                              }
                              if (!valid40) {
                                const err122 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf", keyword: "oneOf", params: { passingSchemas: passing2 } };
                                if (vErrors === null) {
                                  vErrors = [err122];
                                } else {
                                  vErrors.push(err122);
                                }
                                errors++;
                              } else {
                                errors = _errs181;
                                if (vErrors !== null) {
                                  if (_errs181) {
                                    vErrors.length = _errs181;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                              var valid38 = _errs179 === errors;
                              if (!valid38) {
                                break;
                              }
                            }
                          }
                        }
                        var valid37 = _errs177 === errors;
                      } else {
                        var valid37 = true;
                      }
                      if (valid37) {
                        if (data.durationMs !== void 0) {
                          let data71 = data.durationMs;
                          const _errs200 = errors;
                          if (!(typeof data71 == "number" && (!(data71 % 1) && !isNaN(data71)) && isFinite(data71)) && data71 !== null) {
                            const err123 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/8/properties/durationMs/type", keyword: "type", params: { type: schema47.oneOf[8].properties.durationMs.type } };
                            if (vErrors === null) {
                              vErrors = [err123];
                            } else {
                              vErrors.push(err123);
                            }
                            errors++;
                          }
                          var valid37 = _errs200 === errors;
                        } else {
                          var valid37 = true;
                        }
                        if (valid37) {
                          if (data.id !== void 0) {
                            const _errs202 = errors;
                            if (typeof data.id !== "string") {
                              const err124 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/8/properties/id/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err124];
                              } else {
                                vErrors.push(err124);
                              }
                              errors++;
                            }
                            var valid37 = _errs202 === errors;
                          } else {
                            var valid37 = true;
                          }
                          if (valid37) {
                            if (data.namespace !== void 0) {
                              let data73 = data.namespace;
                              const _errs204 = errors;
                              if (typeof data73 !== "string" && data73 !== null) {
                                const err125 = { instancePath: instancePath + "/namespace", schemaPath: "#/oneOf/8/properties/namespace/type", keyword: "type", params: { type: schema47.oneOf[8].properties.namespace.type } };
                                if (vErrors === null) {
                                  vErrors = [err125];
                                } else {
                                  vErrors.push(err125);
                                }
                                errors++;
                              }
                              var valid37 = _errs204 === errors;
                            } else {
                              var valid37 = true;
                            }
                            if (valid37) {
                              if (data.status !== void 0) {
                                let data74 = data.status;
                                const _errs206 = errors;
                                if (typeof data74 !== "string") {
                                  const err126 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err126];
                                  } else {
                                    vErrors.push(err126);
                                  }
                                  errors++;
                                }
                                if (!(data74 === "inProgress" || data74 === "completed" || data74 === "failed")) {
                                  const err127 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema70.enum } };
                                  if (vErrors === null) {
                                    vErrors = [err127];
                                  } else {
                                    vErrors.push(err127);
                                  }
                                  errors++;
                                }
                                var valid37 = _errs206 === errors;
                              } else {
                                var valid37 = true;
                              }
                              if (valid37) {
                                if (data.success !== void 0) {
                                  let data75 = data.success;
                                  const _errs209 = errors;
                                  if (typeof data75 !== "boolean" && data75 !== null) {
                                    const err128 = { instancePath: instancePath + "/success", schemaPath: "#/oneOf/8/properties/success/type", keyword: "type", params: { type: schema47.oneOf[8].properties.success.type } };
                                    if (vErrors === null) {
                                      vErrors = [err128];
                                    } else {
                                      vErrors.push(err128);
                                    }
                                    errors++;
                                  }
                                  var valid37 = _errs209 === errors;
                                } else {
                                  var valid37 = true;
                                }
                                if (valid37) {
                                  if (data.tool !== void 0) {
                                    const _errs211 = errors;
                                    if (typeof data.tool !== "string") {
                                      const err129 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/8/properties/tool/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err129];
                                      } else {
                                        vErrors.push(err129);
                                      }
                                      errors++;
                                    }
                                    var valid37 = _errs211 === errors;
                                  } else {
                                    var valid37 = true;
                                  }
                                  if (valid37) {
                                    if (data.type !== void 0) {
                                      let data77 = data.type;
                                      const _errs213 = errors;
                                      if (typeof data77 !== "string") {
                                        const err130 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err130];
                                        } else {
                                          vErrors.push(err130);
                                        }
                                        errors++;
                                      }
                                      if (!(data77 === "dynamicToolCall")) {
                                        const err131 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[8].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err131];
                                        } else {
                                          vErrors.push(err131);
                                        }
                                        errors++;
                                      }
                                      var valid37 = _errs213 === errors;
                                    } else {
                                      var valid37 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  } else {
                    const err132 = { instancePath, schemaPath: "#/oneOf/8/type", keyword: "type", params: { type: "object" } };
                    if (vErrors === null) {
                      vErrors = [err132];
                    } else {
                      vErrors.push(err132);
                    }
                    errors++;
                  }
                }
                var _valid0 = _errs175 === errors;
                if (_valid0 && valid0) {
                  valid0 = false;
                  passing0 = [passing0, 8];
                } else {
                  if (_valid0) {
                    valid0 = true;
                    passing0 = 8;
                  }
                  const _errs215 = errors;
                  if (errors === _errs215) {
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      let missing16;
                      if (data.agentsStates === void 0 && (missing16 = "agentsStates") || data.id === void 0 && (missing16 = "id") || data.receiverThreadIds === void 0 && (missing16 = "receiverThreadIds") || data.senderThreadId === void 0 && (missing16 = "senderThreadId") || data.status === void 0 && (missing16 = "status") || data.tool === void 0 && (missing16 = "tool") || data.type === void 0 && (missing16 = "type")) {
                        const err133 = { instancePath, schemaPath: "#/oneOf/9/required", keyword: "required", params: { missingProperty: missing16 } };
                        if (vErrors === null) {
                          vErrors = [err133];
                        } else {
                          vErrors.push(err133);
                        }
                        errors++;
                      } else {
                        if (data.agentsStates !== void 0) {
                          let data78 = data.agentsStates;
                          const _errs217 = errors;
                          if (errors === _errs217) {
                            if (data78 && typeof data78 == "object" && !Array.isArray(data78)) {
                              for (const key0 in data78) {
                                const _errs220 = errors;
                                if (!validate53(data78[key0], { instancePath: instancePath + "/agentsStates/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data78, parentDataProperty: key0, rootData })) {
                                  vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
                                  errors = vErrors.length;
                                }
                                var valid46 = _errs220 === errors;
                                if (!valid46) {
                                  break;
                                }
                              }
                            } else {
                              const err134 = { instancePath: instancePath + "/agentsStates", schemaPath: "#/oneOf/9/properties/agentsStates/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err134];
                              } else {
                                vErrors.push(err134);
                              }
                              errors++;
                            }
                          }
                          var valid45 = _errs217 === errors;
                        } else {
                          var valid45 = true;
                        }
                        if (valid45) {
                          if (data.id !== void 0) {
                            const _errs221 = errors;
                            if (typeof data.id !== "string") {
                              const err135 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/9/properties/id/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err135];
                              } else {
                                vErrors.push(err135);
                              }
                              errors++;
                            }
                            var valid45 = _errs221 === errors;
                          } else {
                            var valid45 = true;
                          }
                          if (valid45) {
                            if (data.model !== void 0) {
                              let data81 = data.model;
                              const _errs223 = errors;
                              if (typeof data81 !== "string" && data81 !== null) {
                                const err136 = { instancePath: instancePath + "/model", schemaPath: "#/oneOf/9/properties/model/type", keyword: "type", params: { type: schema47.oneOf[9].properties.model.type } };
                                if (vErrors === null) {
                                  vErrors = [err136];
                                } else {
                                  vErrors.push(err136);
                                }
                                errors++;
                              }
                              var valid45 = _errs223 === errors;
                            } else {
                              var valid45 = true;
                            }
                            if (valid45) {
                              if (data.prompt !== void 0) {
                                let data82 = data.prompt;
                                const _errs225 = errors;
                                if (typeof data82 !== "string" && data82 !== null) {
                                  const err137 = { instancePath: instancePath + "/prompt", schemaPath: "#/oneOf/9/properties/prompt/type", keyword: "type", params: { type: schema47.oneOf[9].properties.prompt.type } };
                                  if (vErrors === null) {
                                    vErrors = [err137];
                                  } else {
                                    vErrors.push(err137);
                                  }
                                  errors++;
                                }
                                var valid45 = _errs225 === errors;
                              } else {
                                var valid45 = true;
                              }
                              if (valid45) {
                                if (data.reasoningEffort !== void 0) {
                                  let data83 = data.reasoningEffort;
                                  const _errs227 = errors;
                                  const _errs228 = errors;
                                  let valid47 = false;
                                  const _errs229 = errors;
                                  const _errs230 = errors;
                                  if (errors === _errs230) {
                                    if (typeof data83 === "string") {
                                      if (func2(data83) < 1) {
                                        const err138 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                                        if (vErrors === null) {
                                          vErrors = [err138];
                                        } else {
                                          vErrors.push(err138);
                                        }
                                        errors++;
                                      }
                                    } else {
                                      const err139 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err139];
                                      } else {
                                        vErrors.push(err139);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid8 = _errs229 === errors;
                                  valid47 = valid47 || _valid8;
                                  if (!valid47) {
                                    const _errs232 = errors;
                                    if (data83 !== null) {
                                      const err140 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/9/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                      if (vErrors === null) {
                                        vErrors = [err140];
                                      } else {
                                        vErrors.push(err140);
                                      }
                                      errors++;
                                    }
                                    var _valid8 = _errs232 === errors;
                                    valid47 = valid47 || _valid8;
                                  }
                                  if (!valid47) {
                                    const err141 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/9/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                                    if (vErrors === null) {
                                      vErrors = [err141];
                                    } else {
                                      vErrors.push(err141);
                                    }
                                    errors++;
                                  } else {
                                    errors = _errs228;
                                    if (vErrors !== null) {
                                      if (_errs228) {
                                        vErrors.length = _errs228;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid45 = _errs227 === errors;
                                } else {
                                  var valid45 = true;
                                }
                                if (valid45) {
                                  if (data.receiverThreadIds !== void 0) {
                                    let data84 = data.receiverThreadIds;
                                    const _errs234 = errors;
                                    if (errors === _errs234) {
                                      if (Array.isArray(data84)) {
                                        var valid49 = true;
                                        const len7 = data84.length;
                                        for (let i7 = 0; i7 < len7; i7++) {
                                          const _errs236 = errors;
                                          if (typeof data84[i7] !== "string") {
                                            const err142 = { instancePath: instancePath + "/receiverThreadIds/" + i7, schemaPath: "#/oneOf/9/properties/receiverThreadIds/items/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err142];
                                            } else {
                                              vErrors.push(err142);
                                            }
                                            errors++;
                                          }
                                          var valid49 = _errs236 === errors;
                                          if (!valid49) {
                                            break;
                                          }
                                        }
                                      } else {
                                        const err143 = { instancePath: instancePath + "/receiverThreadIds", schemaPath: "#/oneOf/9/properties/receiverThreadIds/type", keyword: "type", params: { type: "array" } };
                                        if (vErrors === null) {
                                          vErrors = [err143];
                                        } else {
                                          vErrors.push(err143);
                                        }
                                        errors++;
                                      }
                                    }
                                    var valid45 = _errs234 === errors;
                                  } else {
                                    var valid45 = true;
                                  }
                                  if (valid45) {
                                    if (data.senderThreadId !== void 0) {
                                      const _errs238 = errors;
                                      if (typeof data.senderThreadId !== "string") {
                                        const err144 = { instancePath: instancePath + "/senderThreadId", schemaPath: "#/oneOf/9/properties/senderThreadId/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err144];
                                        } else {
                                          vErrors.push(err144);
                                        }
                                        errors++;
                                      }
                                      var valid45 = _errs238 === errors;
                                    } else {
                                      var valid45 = true;
                                    }
                                    if (valid45) {
                                      if (data.status !== void 0) {
                                        let data87 = data.status;
                                        const _errs240 = errors;
                                        if (typeof data87 !== "string") {
                                          const err145 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err145];
                                          } else {
                                            vErrors.push(err145);
                                          }
                                          errors++;
                                        }
                                        if (!(data87 === "inProgress" || data87 === "completed" || data87 === "failed")) {
                                          const err146 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema74.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err146];
                                          } else {
                                            vErrors.push(err146);
                                          }
                                          errors++;
                                        }
                                        var valid45 = _errs240 === errors;
                                      } else {
                                        var valid45 = true;
                                      }
                                      if (valid45) {
                                        if (data.tool !== void 0) {
                                          let data88 = data.tool;
                                          const _errs244 = errors;
                                          if (typeof data88 !== "string") {
                                            const err147 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err147];
                                            } else {
                                              vErrors.push(err147);
                                            }
                                            errors++;
                                          }
                                          if (!(data88 === "spawnAgent" || data88 === "sendInput" || data88 === "resumeAgent" || data88 === "wait" || data88 === "closeAgent")) {
                                            const err148 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/enum", keyword: "enum", params: { allowedValues: schema75.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err148];
                                            } else {
                                              vErrors.push(err148);
                                            }
                                            errors++;
                                          }
                                          var valid45 = _errs244 === errors;
                                        } else {
                                          var valid45 = true;
                                        }
                                        if (valid45) {
                                          if (data.type !== void 0) {
                                            let data89 = data.type;
                                            const _errs248 = errors;
                                            if (typeof data89 !== "string") {
                                              const err149 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err149];
                                              } else {
                                                vErrors.push(err149);
                                              }
                                              errors++;
                                            }
                                            if (!(data89 === "collabAgentToolCall")) {
                                              const err150 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[9].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err150];
                                              } else {
                                                vErrors.push(err150);
                                              }
                                              errors++;
                                            }
                                            var valid45 = _errs248 === errors;
                                          } else {
                                            var valid45 = true;
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    } else {
                      const err151 = { instancePath, schemaPath: "#/oneOf/9/type", keyword: "type", params: { type: "object" } };
                      if (vErrors === null) {
                        vErrors = [err151];
                      } else {
                        vErrors.push(err151);
                      }
                      errors++;
                    }
                  }
                  var _valid0 = _errs215 === errors;
                  if (_valid0 && valid0) {
                    valid0 = false;
                    passing0 = [passing0, 9];
                  } else {
                    if (_valid0) {
                      valid0 = true;
                      passing0 = 9;
                    }
                    const _errs250 = errors;
                    if (errors === _errs250) {
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        let missing17;
                        if (data.agentPath === void 0 && (missing17 = "agentPath") || data.agentThreadId === void 0 && (missing17 = "agentThreadId") || data.id === void 0 && (missing17 = "id") || data.kind === void 0 && (missing17 = "kind") || data.type === void 0 && (missing17 = "type")) {
                          const err152 = { instancePath, schemaPath: "#/oneOf/10/required", keyword: "required", params: { missingProperty: missing17 } };
                          if (vErrors === null) {
                            vErrors = [err152];
                          } else {
                            vErrors.push(err152);
                          }
                          errors++;
                        } else {
                          if (data.agentPath !== void 0) {
                            const _errs252 = errors;
                            if (typeof data.agentPath !== "string") {
                              const err153 = { instancePath: instancePath + "/agentPath", schemaPath: "#/oneOf/10/properties/agentPath/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err153];
                              } else {
                                vErrors.push(err153);
                              }
                              errors++;
                            }
                            var valid54 = _errs252 === errors;
                          } else {
                            var valid54 = true;
                          }
                          if (valid54) {
                            if (data.agentThreadId !== void 0) {
                              const _errs254 = errors;
                              if (typeof data.agentThreadId !== "string") {
                                const err154 = { instancePath: instancePath + "/agentThreadId", schemaPath: "#/oneOf/10/properties/agentThreadId/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err154];
                                } else {
                                  vErrors.push(err154);
                                }
                                errors++;
                              }
                              var valid54 = _errs254 === errors;
                            } else {
                              var valid54 = true;
                            }
                            if (valid54) {
                              if (data.id !== void 0) {
                                const _errs256 = errors;
                                if (typeof data.id !== "string") {
                                  const err155 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/10/properties/id/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err155];
                                  } else {
                                    vErrors.push(err155);
                                  }
                                  errors++;
                                }
                                var valid54 = _errs256 === errors;
                              } else {
                                var valid54 = true;
                              }
                              if (valid54) {
                                if (data.kind !== void 0) {
                                  let data93 = data.kind;
                                  const _errs258 = errors;
                                  if (typeof data93 !== "string") {
                                    const err156 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err156];
                                    } else {
                                      vErrors.push(err156);
                                    }
                                    errors++;
                                  }
                                  if (!(data93 === "started" || data93 === "interacted" || data93 === "interrupted")) {
                                    const err157 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/enum", keyword: "enum", params: { allowedValues: schema76.enum } };
                                    if (vErrors === null) {
                                      vErrors = [err157];
                                    } else {
                                      vErrors.push(err157);
                                    }
                                    errors++;
                                  }
                                  var valid54 = _errs258 === errors;
                                } else {
                                  var valid54 = true;
                                }
                                if (valid54) {
                                  if (data.type !== void 0) {
                                    let data94 = data.type;
                                    const _errs261 = errors;
                                    if (typeof data94 !== "string") {
                                      const err158 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err158];
                                      } else {
                                        vErrors.push(err158);
                                      }
                                      errors++;
                                    }
                                    if (!(data94 === "subAgentActivity")) {
                                      const err159 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[10].properties.type.enum } };
                                      if (vErrors === null) {
                                        vErrors = [err159];
                                      } else {
                                        vErrors.push(err159);
                                      }
                                      errors++;
                                    }
                                    var valid54 = _errs261 === errors;
                                  } else {
                                    var valid54 = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      } else {
                        const err160 = { instancePath, schemaPath: "#/oneOf/10/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err160];
                        } else {
                          vErrors.push(err160);
                        }
                        errors++;
                      }
                    }
                    var _valid0 = _errs250 === errors;
                    if (_valid0 && valid0) {
                      valid0 = false;
                      passing0 = [passing0, 10];
                    } else {
                      if (_valid0) {
                        valid0 = true;
                        passing0 = 10;
                      }
                      const _errs263 = errors;
                      if (errors === _errs263) {
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          let missing18;
                          if (data.id === void 0 && (missing18 = "id") || data.query === void 0 && (missing18 = "query") || data.type === void 0 && (missing18 = "type")) {
                            const err161 = { instancePath, schemaPath: "#/oneOf/11/required", keyword: "required", params: { missingProperty: missing18 } };
                            if (vErrors === null) {
                              vErrors = [err161];
                            } else {
                              vErrors.push(err161);
                            }
                            errors++;
                          } else {
                            if (data.action !== void 0) {
                              let data95 = data.action;
                              const _errs265 = errors;
                              const _errs266 = errors;
                              let valid57 = false;
                              const _errs267 = errors;
                              const _errs269 = errors;
                              let valid59 = false;
                              let passing3 = null;
                              const _errs270 = errors;
                              if (errors === _errs270) {
                                if (data95 && typeof data95 == "object" && !Array.isArray(data95)) {
                                  let missing19;
                                  if (data95.type === void 0 && (missing19 = "type")) {
                                    const err162 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/required", keyword: "required", params: { missingProperty: missing19 } };
                                    if (vErrors === null) {
                                      vErrors = [err162];
                                    } else {
                                      vErrors.push(err162);
                                    }
                                    errors++;
                                  } else {
                                    if (data95.queries !== void 0) {
                                      let data96 = data95.queries;
                                      const _errs272 = errors;
                                      if (!Array.isArray(data96) && data96 !== null) {
                                        const err163 = { instancePath: instancePath + "/action/queries", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/type", keyword: "type", params: { type: schema77.oneOf[0].properties.queries.type } };
                                        if (vErrors === null) {
                                          vErrors = [err163];
                                        } else {
                                          vErrors.push(err163);
                                        }
                                        errors++;
                                      }
                                      if (errors === _errs272) {
                                        if (Array.isArray(data96)) {
                                          var valid61 = true;
                                          const len8 = data96.length;
                                          for (let i8 = 0; i8 < len8; i8++) {
                                            const _errs274 = errors;
                                            if (typeof data96[i8] !== "string") {
                                              const err164 = { instancePath: instancePath + "/action/queries/" + i8, schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/items/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err164];
                                              } else {
                                                vErrors.push(err164);
                                              }
                                              errors++;
                                            }
                                            var valid61 = _errs274 === errors;
                                            if (!valid61) {
                                              break;
                                            }
                                          }
                                        }
                                      }
                                      var valid60 = _errs272 === errors;
                                    } else {
                                      var valid60 = true;
                                    }
                                    if (valid60) {
                                      if (data95.query !== void 0) {
                                        let data98 = data95.query;
                                        const _errs276 = errors;
                                        if (typeof data98 !== "string" && data98 !== null) {
                                          const err165 = { instancePath: instancePath + "/action/query", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/query/type", keyword: "type", params: { type: schema77.oneOf[0].properties.query.type } };
                                          if (vErrors === null) {
                                            vErrors = [err165];
                                          } else {
                                            vErrors.push(err165);
                                          }
                                          errors++;
                                        }
                                        var valid60 = _errs276 === errors;
                                      } else {
                                        var valid60 = true;
                                      }
                                      if (valid60) {
                                        if (data95.type !== void 0) {
                                          let data99 = data95.type;
                                          const _errs278 = errors;
                                          if (typeof data99 !== "string") {
                                            const err166 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err166];
                                            } else {
                                              vErrors.push(err166);
                                            }
                                            errors++;
                                          }
                                          if (!(data99 === "search")) {
                                            const err167 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema77.oneOf[0].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err167];
                                            } else {
                                              vErrors.push(err167);
                                            }
                                            errors++;
                                          }
                                          var valid60 = _errs278 === errors;
                                        } else {
                                          var valid60 = true;
                                        }
                                      }
                                    }
                                  }
                                } else {
                                  const err168 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err168];
                                  } else {
                                    vErrors.push(err168);
                                  }
                                  errors++;
                                }
                              }
                              var _valid10 = _errs270 === errors;
                              if (_valid10) {
                                valid59 = true;
                                passing3 = 0;
                              }
                              const _errs280 = errors;
                              if (errors === _errs280) {
                                if (data95 && typeof data95 == "object" && !Array.isArray(data95)) {
                                  let missing20;
                                  if (data95.type === void 0 && (missing20 = "type")) {
                                    const err169 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/required", keyword: "required", params: { missingProperty: missing20 } };
                                    if (vErrors === null) {
                                      vErrors = [err169];
                                    } else {
                                      vErrors.push(err169);
                                    }
                                    errors++;
                                  } else {
                                    if (data95.type !== void 0) {
                                      let data100 = data95.type;
                                      const _errs282 = errors;
                                      if (typeof data100 !== "string") {
                                        const err170 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err170];
                                        } else {
                                          vErrors.push(err170);
                                        }
                                        errors++;
                                      }
                                      if (!(data100 === "openPage")) {
                                        const err171 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema77.oneOf[1].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err171];
                                        } else {
                                          vErrors.push(err171);
                                        }
                                        errors++;
                                      }
                                      var valid62 = _errs282 === errors;
                                    } else {
                                      var valid62 = true;
                                    }
                                    if (valid62) {
                                      if (data95.url !== void 0) {
                                        let data101 = data95.url;
                                        const _errs284 = errors;
                                        if (typeof data101 !== "string" && data101 !== null) {
                                          const err172 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/url/type", keyword: "type", params: { type: schema77.oneOf[1].properties.url.type } };
                                          if (vErrors === null) {
                                            vErrors = [err172];
                                          } else {
                                            vErrors.push(err172);
                                          }
                                          errors++;
                                        }
                                        var valid62 = _errs284 === errors;
                                      } else {
                                        var valid62 = true;
                                      }
                                    }
                                  }
                                } else {
                                  const err173 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err173];
                                  } else {
                                    vErrors.push(err173);
                                  }
                                  errors++;
                                }
                              }
                              var _valid10 = _errs280 === errors;
                              if (_valid10 && valid59) {
                                valid59 = false;
                                passing3 = [passing3, 1];
                              } else {
                                if (_valid10) {
                                  valid59 = true;
                                  passing3 = 1;
                                }
                                const _errs286 = errors;
                                if (errors === _errs286) {
                                  if (data95 && typeof data95 == "object" && !Array.isArray(data95)) {
                                    let missing21;
                                    if (data95.type === void 0 && (missing21 = "type")) {
                                      const err174 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/required", keyword: "required", params: { missingProperty: missing21 } };
                                      if (vErrors === null) {
                                        vErrors = [err174];
                                      } else {
                                        vErrors.push(err174);
                                      }
                                      errors++;
                                    } else {
                                      if (data95.pattern !== void 0) {
                                        let data102 = data95.pattern;
                                        const _errs288 = errors;
                                        if (typeof data102 !== "string" && data102 !== null) {
                                          const err175 = { instancePath: instancePath + "/action/pattern", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/pattern/type", keyword: "type", params: { type: schema77.oneOf[2].properties.pattern.type } };
                                          if (vErrors === null) {
                                            vErrors = [err175];
                                          } else {
                                            vErrors.push(err175);
                                          }
                                          errors++;
                                        }
                                        var valid63 = _errs288 === errors;
                                      } else {
                                        var valid63 = true;
                                      }
                                      if (valid63) {
                                        if (data95.type !== void 0) {
                                          let data103 = data95.type;
                                          const _errs290 = errors;
                                          if (typeof data103 !== "string") {
                                            const err176 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err176];
                                            } else {
                                              vErrors.push(err176);
                                            }
                                            errors++;
                                          }
                                          if (!(data103 === "findInPage")) {
                                            const err177 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema77.oneOf[2].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err177];
                                            } else {
                                              vErrors.push(err177);
                                            }
                                            errors++;
                                          }
                                          var valid63 = _errs290 === errors;
                                        } else {
                                          var valid63 = true;
                                        }
                                        if (valid63) {
                                          if (data95.url !== void 0) {
                                            let data104 = data95.url;
                                            const _errs292 = errors;
                                            if (typeof data104 !== "string" && data104 !== null) {
                                              const err178 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/url/type", keyword: "type", params: { type: schema77.oneOf[2].properties.url.type } };
                                              if (vErrors === null) {
                                                vErrors = [err178];
                                              } else {
                                                vErrors.push(err178);
                                              }
                                              errors++;
                                            }
                                            var valid63 = _errs292 === errors;
                                          } else {
                                            var valid63 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err179 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err179];
                                    } else {
                                      vErrors.push(err179);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid10 = _errs286 === errors;
                                if (_valid10 && valid59) {
                                  valid59 = false;
                                  passing3 = [passing3, 2];
                                } else {
                                  if (_valid10) {
                                    valid59 = true;
                                    passing3 = 2;
                                  }
                                  const _errs294 = errors;
                                  if (errors === _errs294) {
                                    if (data95 && typeof data95 == "object" && !Array.isArray(data95)) {
                                      let missing22;
                                      if (data95.type === void 0 && (missing22 = "type")) {
                                        const err180 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/required", keyword: "required", params: { missingProperty: missing22 } };
                                        if (vErrors === null) {
                                          vErrors = [err180];
                                        } else {
                                          vErrors.push(err180);
                                        }
                                        errors++;
                                      } else {
                                        if (data95.type !== void 0) {
                                          let data105 = data95.type;
                                          if (typeof data105 !== "string") {
                                            const err181 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err181];
                                            } else {
                                              vErrors.push(err181);
                                            }
                                            errors++;
                                          }
                                          if (!(data105 === "other")) {
                                            const err182 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema77.oneOf[3].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err182];
                                            } else {
                                              vErrors.push(err182);
                                            }
                                            errors++;
                                          }
                                        }
                                      }
                                    } else {
                                      const err183 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err183];
                                      } else {
                                        vErrors.push(err183);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid10 = _errs294 === errors;
                                  if (_valid10 && valid59) {
                                    valid59 = false;
                                    passing3 = [passing3, 3];
                                  } else {
                                    if (_valid10) {
                                      valid59 = true;
                                      passing3 = 3;
                                    }
                                  }
                                }
                              }
                              if (!valid59) {
                                const err184 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf", keyword: "oneOf", params: { passingSchemas: passing3 } };
                                if (vErrors === null) {
                                  vErrors = [err184];
                                } else {
                                  vErrors.push(err184);
                                }
                                errors++;
                              } else {
                                errors = _errs269;
                                if (vErrors !== null) {
                                  if (_errs269) {
                                    vErrors.length = _errs269;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                              var _valid9 = _errs267 === errors;
                              valid57 = valid57 || _valid9;
                              if (!valid57) {
                                const _errs298 = errors;
                                if (data95 !== null) {
                                  const err185 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/11/properties/action/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                  if (vErrors === null) {
                                    vErrors = [err185];
                                  } else {
                                    vErrors.push(err185);
                                  }
                                  errors++;
                                }
                                var _valid9 = _errs298 === errors;
                                valid57 = valid57 || _valid9;
                              }
                              if (!valid57) {
                                const err186 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/11/properties/action/anyOf", keyword: "anyOf", params: {} };
                                if (vErrors === null) {
                                  vErrors = [err186];
                                } else {
                                  vErrors.push(err186);
                                }
                                errors++;
                              } else {
                                errors = _errs266;
                                if (vErrors !== null) {
                                  if (_errs266) {
                                    vErrors.length = _errs266;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                              var valid56 = _errs265 === errors;
                            } else {
                              var valid56 = true;
                            }
                            if (valid56) {
                              if (data.id !== void 0) {
                                const _errs300 = errors;
                                if (typeof data.id !== "string") {
                                  const err187 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/11/properties/id/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err187];
                                  } else {
                                    vErrors.push(err187);
                                  }
                                  errors++;
                                }
                                var valid56 = _errs300 === errors;
                              } else {
                                var valid56 = true;
                              }
                              if (valid56) {
                                if (data.query !== void 0) {
                                  const _errs302 = errors;
                                  if (typeof data.query !== "string") {
                                    const err188 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/11/properties/query/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err188];
                                    } else {
                                      vErrors.push(err188);
                                    }
                                    errors++;
                                  }
                                  var valid56 = _errs302 === errors;
                                } else {
                                  var valid56 = true;
                                }
                                if (valid56) {
                                  if (data.results !== void 0) {
                                    let data108 = data.results;
                                    const _errs304 = errors;
                                    if (!Array.isArray(data108) && data108 !== null) {
                                      const err189 = { instancePath: instancePath + "/results", schemaPath: "#/oneOf/11/properties/results/type", keyword: "type", params: { type: schema47.oneOf[11].properties.results.type } };
                                      if (vErrors === null) {
                                        vErrors = [err189];
                                      } else {
                                        vErrors.push(err189);
                                      }
                                      errors++;
                                    }
                                    var valid56 = _errs304 === errors;
                                  } else {
                                    var valid56 = true;
                                  }
                                  if (valid56) {
                                    if (data.type !== void 0) {
                                      let data109 = data.type;
                                      const _errs306 = errors;
                                      if (typeof data109 !== "string") {
                                        const err190 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err190];
                                        } else {
                                          vErrors.push(err190);
                                        }
                                        errors++;
                                      }
                                      if (!(data109 === "webSearch")) {
                                        const err191 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[11].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err191];
                                        } else {
                                          vErrors.push(err191);
                                        }
                                        errors++;
                                      }
                                      var valid56 = _errs306 === errors;
                                    } else {
                                      var valid56 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          const err192 = { instancePath, schemaPath: "#/oneOf/11/type", keyword: "type", params: { type: "object" } };
                          if (vErrors === null) {
                            vErrors = [err192];
                          } else {
                            vErrors.push(err192);
                          }
                          errors++;
                        }
                      }
                      var _valid0 = _errs263 === errors;
                      if (_valid0 && valid0) {
                        valid0 = false;
                        passing0 = [passing0, 11];
                      } else {
                        if (_valid0) {
                          valid0 = true;
                          passing0 = 11;
                        }
                        const _errs308 = errors;
                        if (errors === _errs308) {
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            let missing23;
                            if (data.id === void 0 && (missing23 = "id") || data.path === void 0 && (missing23 = "path") || data.type === void 0 && (missing23 = "type")) {
                              const err193 = { instancePath, schemaPath: "#/oneOf/12/required", keyword: "required", params: { missingProperty: missing23 } };
                              if (vErrors === null) {
                                vErrors = [err193];
                              } else {
                                vErrors.push(err193);
                              }
                              errors++;
                            } else {
                              if (data.id !== void 0) {
                                const _errs310 = errors;
                                if (typeof data.id !== "string") {
                                  const err194 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/12/properties/id/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err194];
                                  } else {
                                    vErrors.push(err194);
                                  }
                                  errors++;
                                }
                                var valid65 = _errs310 === errors;
                              } else {
                                var valid65 = true;
                              }
                              if (valid65) {
                                if (data.path !== void 0) {
                                  const _errs312 = errors;
                                  if (typeof data.path !== "string") {
                                    const err195 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err195];
                                    } else {
                                      vErrors.push(err195);
                                    }
                                    errors++;
                                  }
                                  var valid65 = _errs312 === errors;
                                } else {
                                  var valid65 = true;
                                }
                                if (valid65) {
                                  if (data.type !== void 0) {
                                    let data112 = data.type;
                                    const _errs315 = errors;
                                    if (typeof data112 !== "string") {
                                      const err196 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err196];
                                      } else {
                                        vErrors.push(err196);
                                      }
                                      errors++;
                                    }
                                    if (!(data112 === "imageView")) {
                                      const err197 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[12].properties.type.enum } };
                                      if (vErrors === null) {
                                        vErrors = [err197];
                                      } else {
                                        vErrors.push(err197);
                                      }
                                      errors++;
                                    }
                                    var valid65 = _errs315 === errors;
                                  } else {
                                    var valid65 = true;
                                  }
                                }
                              }
                            }
                          } else {
                            const err198 = { instancePath, schemaPath: "#/oneOf/12/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err198];
                            } else {
                              vErrors.push(err198);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs308 === errors;
                        if (_valid0 && valid0) {
                          valid0 = false;
                          passing0 = [passing0, 12];
                        } else {
                          if (_valid0) {
                            valid0 = true;
                            passing0 = 12;
                          }
                          const _errs317 = errors;
                          if (errors === _errs317) {
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              let missing24;
                              if (data.durationMs === void 0 && (missing24 = "durationMs") || data.id === void 0 && (missing24 = "id") || data.type === void 0 && (missing24 = "type")) {
                                const err199 = { instancePath, schemaPath: "#/oneOf/13/required", keyword: "required", params: { missingProperty: missing24 } };
                                if (vErrors === null) {
                                  vErrors = [err199];
                                } else {
                                  vErrors.push(err199);
                                }
                                errors++;
                              } else {
                                if (data.durationMs !== void 0) {
                                  let data113 = data.durationMs;
                                  const _errs319 = errors;
                                  if (!(typeof data113 == "number" && (!(data113 % 1) && !isNaN(data113)) && isFinite(data113))) {
                                    const err200 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/13/properties/durationMs/type", keyword: "type", params: { type: "integer" } };
                                    if (vErrors === null) {
                                      vErrors = [err200];
                                    } else {
                                      vErrors.push(err200);
                                    }
                                    errors++;
                                  }
                                  if (errors === _errs319) {
                                    if (typeof data113 == "number" && isFinite(data113)) {
                                      if (data113 < 0 || isNaN(data113)) {
                                        const err201 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/13/properties/durationMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                                        if (vErrors === null) {
                                          vErrors = [err201];
                                        } else {
                                          vErrors.push(err201);
                                        }
                                        errors++;
                                      }
                                    }
                                  }
                                  var valid67 = _errs319 === errors;
                                } else {
                                  var valid67 = true;
                                }
                                if (valid67) {
                                  if (data.id !== void 0) {
                                    const _errs321 = errors;
                                    if (typeof data.id !== "string") {
                                      const err202 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/13/properties/id/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err202];
                                      } else {
                                        vErrors.push(err202);
                                      }
                                      errors++;
                                    }
                                    var valid67 = _errs321 === errors;
                                  } else {
                                    var valid67 = true;
                                  }
                                  if (valid67) {
                                    if (data.type !== void 0) {
                                      let data115 = data.type;
                                      const _errs323 = errors;
                                      if (typeof data115 !== "string") {
                                        const err203 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err203];
                                        } else {
                                          vErrors.push(err203);
                                        }
                                        errors++;
                                      }
                                      if (!(data115 === "sleep")) {
                                        const err204 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[13].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err204];
                                        } else {
                                          vErrors.push(err204);
                                        }
                                        errors++;
                                      }
                                      var valid67 = _errs323 === errors;
                                    } else {
                                      var valid67 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err205 = { instancePath, schemaPath: "#/oneOf/13/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err205];
                              } else {
                                vErrors.push(err205);
                              }
                              errors++;
                            }
                          }
                          var _valid0 = _errs317 === errors;
                          if (_valid0 && valid0) {
                            valid0 = false;
                            passing0 = [passing0, 13];
                          } else {
                            if (_valid0) {
                              valid0 = true;
                              passing0 = 13;
                            }
                            const _errs325 = errors;
                            if (errors === _errs325) {
                              if (data && typeof data == "object" && !Array.isArray(data)) {
                                let missing25;
                                if (data.id === void 0 && (missing25 = "id") || data.result === void 0 && (missing25 = "result") || data.status === void 0 && (missing25 = "status") || data.type === void 0 && (missing25 = "type")) {
                                  const err206 = { instancePath, schemaPath: "#/oneOf/14/required", keyword: "required", params: { missingProperty: missing25 } };
                                  if (vErrors === null) {
                                    vErrors = [err206];
                                  } else {
                                    vErrors.push(err206);
                                  }
                                  errors++;
                                } else {
                                  if (data.failure !== void 0) {
                                    let data116 = data.failure;
                                    const _errs327 = errors;
                                    const _errs328 = errors;
                                    let valid69 = false;
                                    const _errs329 = errors;
                                    const _errs331 = errors;
                                    let valid71 = false;
                                    let passing4 = null;
                                    const _errs332 = errors;
                                    if (errors === _errs332) {
                                      if (data116 && typeof data116 == "object" && !Array.isArray(data116)) {
                                        let missing26;
                                        if (data116.limitId === void 0 && (missing26 = "limitId") || data116.type === void 0 && (missing26 = "type")) {
                                          const err207 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/required", keyword: "required", params: { missingProperty: missing26 } };
                                          if (vErrors === null) {
                                            vErrors = [err207];
                                          } else {
                                            vErrors.push(err207);
                                          }
                                          errors++;
                                        } else {
                                          if (data116.limitId !== void 0) {
                                            const _errs334 = errors;
                                            if (typeof data116.limitId !== "string") {
                                              const err208 = { instancePath: instancePath + "/failure/limitId", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/limitId/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err208];
                                              } else {
                                                vErrors.push(err208);
                                              }
                                              errors++;
                                            }
                                            var valid72 = _errs334 === errors;
                                          } else {
                                            var valid72 = true;
                                          }
                                          if (valid72) {
                                            if (data116.resetsAt !== void 0) {
                                              let data118 = data116.resetsAt;
                                              const _errs336 = errors;
                                              if (!(typeof data118 == "number" && (!(data118 % 1) && !isNaN(data118)) && isFinite(data118)) && data118 !== null) {
                                                const err209 = { instancePath: instancePath + "/failure/resetsAt", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/resetsAt/type", keyword: "type", params: { type: schema79.oneOf[0].properties.resetsAt.type } };
                                                if (vErrors === null) {
                                                  vErrors = [err209];
                                                } else {
                                                  vErrors.push(err209);
                                                }
                                                errors++;
                                              }
                                              var valid72 = _errs336 === errors;
                                            } else {
                                              var valid72 = true;
                                            }
                                            if (valid72) {
                                              if (data116.type !== void 0) {
                                                let data119 = data116.type;
                                                const _errs338 = errors;
                                                if (typeof data119 !== "string") {
                                                  const err210 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err210];
                                                  } else {
                                                    vErrors.push(err210);
                                                  }
                                                  errors++;
                                                }
                                                if (!(data119 === "usageLimitExceeded")) {
                                                  const err211 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema79.oneOf[0].properties.type.enum } };
                                                  if (vErrors === null) {
                                                    vErrors = [err211];
                                                  } else {
                                                    vErrors.push(err211);
                                                  }
                                                  errors++;
                                                }
                                                var valid72 = _errs338 === errors;
                                              } else {
                                                var valid72 = true;
                                              }
                                            }
                                          }
                                        }
                                      } else {
                                        const err212 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err212];
                                        } else {
                                          vErrors.push(err212);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid12 = _errs332 === errors;
                                    if (_valid12) {
                                      valid71 = true;
                                      passing4 = 0;
                                    }
                                    if (!valid71) {
                                      const err213 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf", keyword: "oneOf", params: { passingSchemas: passing4 } };
                                      if (vErrors === null) {
                                        vErrors = [err213];
                                      } else {
                                        vErrors.push(err213);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs331;
                                      if (vErrors !== null) {
                                        if (_errs331) {
                                          vErrors.length = _errs331;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var _valid11 = _errs329 === errors;
                                    valid69 = valid69 || _valid11;
                                    if (!valid69) {
                                      const _errs340 = errors;
                                      if (data116 !== null) {
                                        const err214 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/14/properties/failure/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                        if (vErrors === null) {
                                          vErrors = [err214];
                                        } else {
                                          vErrors.push(err214);
                                        }
                                        errors++;
                                      }
                                      var _valid11 = _errs340 === errors;
                                      valid69 = valid69 || _valid11;
                                    }
                                    if (!valid69) {
                                      const err215 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/14/properties/failure/anyOf", keyword: "anyOf", params: {} };
                                      if (vErrors === null) {
                                        vErrors = [err215];
                                      } else {
                                        vErrors.push(err215);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs328;
                                      if (vErrors !== null) {
                                        if (_errs328) {
                                          vErrors.length = _errs328;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid68 = _errs327 === errors;
                                  } else {
                                    var valid68 = true;
                                  }
                                  if (valid68) {
                                    if (data.id !== void 0) {
                                      const _errs342 = errors;
                                      if (typeof data.id !== "string") {
                                        const err216 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/14/properties/id/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err216];
                                        } else {
                                          vErrors.push(err216);
                                        }
                                        errors++;
                                      }
                                      var valid68 = _errs342 === errors;
                                    } else {
                                      var valid68 = true;
                                    }
                                    if (valid68) {
                                      if (data.result !== void 0) {
                                        const _errs344 = errors;
                                        if (typeof data.result !== "string") {
                                          const err217 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/14/properties/result/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err217];
                                          } else {
                                            vErrors.push(err217);
                                          }
                                          errors++;
                                        }
                                        var valid68 = _errs344 === errors;
                                      } else {
                                        var valid68 = true;
                                      }
                                      if (valid68) {
                                        if (data.revisedPrompt !== void 0) {
                                          let data122 = data.revisedPrompt;
                                          const _errs346 = errors;
                                          if (typeof data122 !== "string" && data122 !== null) {
                                            const err218 = { instancePath: instancePath + "/revisedPrompt", schemaPath: "#/oneOf/14/properties/revisedPrompt/type", keyword: "type", params: { type: schema47.oneOf[14].properties.revisedPrompt.type } };
                                            if (vErrors === null) {
                                              vErrors = [err218];
                                            } else {
                                              vErrors.push(err218);
                                            }
                                            errors++;
                                          }
                                          var valid68 = _errs346 === errors;
                                        } else {
                                          var valid68 = true;
                                        }
                                        if (valid68) {
                                          if (data.savedPath !== void 0) {
                                            let data123 = data.savedPath;
                                            const _errs348 = errors;
                                            const _errs349 = errors;
                                            let valid73 = false;
                                            const _errs350 = errors;
                                            if (typeof data123 !== "string") {
                                              const err219 = { instancePath: instancePath + "/savedPath", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err219];
                                              } else {
                                                vErrors.push(err219);
                                              }
                                              errors++;
                                            }
                                            var _valid13 = _errs350 === errors;
                                            valid73 = valid73 || _valid13;
                                            if (!valid73) {
                                              const _errs353 = errors;
                                              if (data123 !== null) {
                                                const err220 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/14/properties/savedPath/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                if (vErrors === null) {
                                                  vErrors = [err220];
                                                } else {
                                                  vErrors.push(err220);
                                                }
                                                errors++;
                                              }
                                              var _valid13 = _errs353 === errors;
                                              valid73 = valid73 || _valid13;
                                            }
                                            if (!valid73) {
                                              const err221 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/14/properties/savedPath/anyOf", keyword: "anyOf", params: {} };
                                              if (vErrors === null) {
                                                vErrors = [err221];
                                              } else {
                                                vErrors.push(err221);
                                              }
                                              errors++;
                                            } else {
                                              errors = _errs349;
                                              if (vErrors !== null) {
                                                if (_errs349) {
                                                  vErrors.length = _errs349;
                                                } else {
                                                  vErrors = null;
                                                }
                                              }
                                            }
                                            var valid68 = _errs348 === errors;
                                          } else {
                                            var valid68 = true;
                                          }
                                          if (valid68) {
                                            if (data.status !== void 0) {
                                              const _errs355 = errors;
                                              if (typeof data.status !== "string") {
                                                const err222 = { instancePath: instancePath + "/status", schemaPath: "#/oneOf/14/properties/status/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err222];
                                                } else {
                                                  vErrors.push(err222);
                                                }
                                                errors++;
                                              }
                                              var valid68 = _errs355 === errors;
                                            } else {
                                              var valid68 = true;
                                            }
                                            if (valid68) {
                                              if (data.transparentBackground !== void 0) {
                                                let data125 = data.transparentBackground;
                                                const _errs357 = errors;
                                                if (typeof data125 !== "boolean" && data125 !== null) {
                                                  const err223 = { instancePath: instancePath + "/transparentBackground", schemaPath: "#/oneOf/14/properties/transparentBackground/type", keyword: "type", params: { type: schema47.oneOf[14].properties.transparentBackground.type } };
                                                  if (vErrors === null) {
                                                    vErrors = [err223];
                                                  } else {
                                                    vErrors.push(err223);
                                                  }
                                                  errors++;
                                                }
                                                var valid68 = _errs357 === errors;
                                              } else {
                                                var valid68 = true;
                                              }
                                              if (valid68) {
                                                if (data.type !== void 0) {
                                                  let data126 = data.type;
                                                  const _errs359 = errors;
                                                  if (typeof data126 !== "string") {
                                                    const err224 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/type", keyword: "type", params: { type: "string" } };
                                                    if (vErrors === null) {
                                                      vErrors = [err224];
                                                    } else {
                                                      vErrors.push(err224);
                                                    }
                                                    errors++;
                                                  }
                                                  if (!(data126 === "imageGeneration")) {
                                                    const err225 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[14].properties.type.enum } };
                                                    if (vErrors === null) {
                                                      vErrors = [err225];
                                                    } else {
                                                      vErrors.push(err225);
                                                    }
                                                    errors++;
                                                  }
                                                  var valid68 = _errs359 === errors;
                                                } else {
                                                  var valid68 = true;
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              } else {
                                const err226 = { instancePath, schemaPath: "#/oneOf/14/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err226];
                                } else {
                                  vErrors.push(err226);
                                }
                                errors++;
                              }
                            }
                            var _valid0 = _errs325 === errors;
                            if (_valid0 && valid0) {
                              valid0 = false;
                              passing0 = [passing0, 14];
                            } else {
                              if (_valid0) {
                                valid0 = true;
                                passing0 = 14;
                              }
                              const _errs361 = errors;
                              if (errors === _errs361) {
                                if (data && typeof data == "object" && !Array.isArray(data)) {
                                  let missing27;
                                  if (data.id === void 0 && (missing27 = "id") || data.review === void 0 && (missing27 = "review") || data.type === void 0 && (missing27 = "type")) {
                                    const err227 = { instancePath, schemaPath: "#/oneOf/15/required", keyword: "required", params: { missingProperty: missing27 } };
                                    if (vErrors === null) {
                                      vErrors = [err227];
                                    } else {
                                      vErrors.push(err227);
                                    }
                                    errors++;
                                  } else {
                                    if (data.id !== void 0) {
                                      const _errs363 = errors;
                                      if (typeof data.id !== "string") {
                                        const err228 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/15/properties/id/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err228];
                                        } else {
                                          vErrors.push(err228);
                                        }
                                        errors++;
                                      }
                                      var valid75 = _errs363 === errors;
                                    } else {
                                      var valid75 = true;
                                    }
                                    if (valid75) {
                                      if (data.review !== void 0) {
                                        const _errs365 = errors;
                                        if (typeof data.review !== "string") {
                                          const err229 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/15/properties/review/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err229];
                                          } else {
                                            vErrors.push(err229);
                                          }
                                          errors++;
                                        }
                                        var valid75 = _errs365 === errors;
                                      } else {
                                        var valid75 = true;
                                      }
                                      if (valid75) {
                                        if (data.type !== void 0) {
                                          let data129 = data.type;
                                          const _errs367 = errors;
                                          if (typeof data129 !== "string") {
                                            const err230 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err230];
                                            } else {
                                              vErrors.push(err230);
                                            }
                                            errors++;
                                          }
                                          if (!(data129 === "enteredReviewMode")) {
                                            const err231 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[15].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err231];
                                            } else {
                                              vErrors.push(err231);
                                            }
                                            errors++;
                                          }
                                          var valid75 = _errs367 === errors;
                                        } else {
                                          var valid75 = true;
                                        }
                                      }
                                    }
                                  }
                                } else {
                                  const err232 = { instancePath, schemaPath: "#/oneOf/15/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err232];
                                  } else {
                                    vErrors.push(err232);
                                  }
                                  errors++;
                                }
                              }
                              var _valid0 = _errs361 === errors;
                              if (_valid0 && valid0) {
                                valid0 = false;
                                passing0 = [passing0, 15];
                              } else {
                                if (_valid0) {
                                  valid0 = true;
                                  passing0 = 15;
                                }
                                const _errs369 = errors;
                                if (errors === _errs369) {
                                  if (data && typeof data == "object" && !Array.isArray(data)) {
                                    let missing28;
                                    if (data.id === void 0 && (missing28 = "id") || data.review === void 0 && (missing28 = "review") || data.type === void 0 && (missing28 = "type")) {
                                      const err233 = { instancePath, schemaPath: "#/oneOf/16/required", keyword: "required", params: { missingProperty: missing28 } };
                                      if (vErrors === null) {
                                        vErrors = [err233];
                                      } else {
                                        vErrors.push(err233);
                                      }
                                      errors++;
                                    } else {
                                      if (data.id !== void 0) {
                                        const _errs371 = errors;
                                        if (typeof data.id !== "string") {
                                          const err234 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/16/properties/id/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err234];
                                          } else {
                                            vErrors.push(err234);
                                          }
                                          errors++;
                                        }
                                        var valid76 = _errs371 === errors;
                                      } else {
                                        var valid76 = true;
                                      }
                                      if (valid76) {
                                        if (data.review !== void 0) {
                                          const _errs373 = errors;
                                          if (typeof data.review !== "string") {
                                            const err235 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/16/properties/review/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err235];
                                            } else {
                                              vErrors.push(err235);
                                            }
                                            errors++;
                                          }
                                          var valid76 = _errs373 === errors;
                                        } else {
                                          var valid76 = true;
                                        }
                                        if (valid76) {
                                          if (data.type !== void 0) {
                                            let data132 = data.type;
                                            const _errs375 = errors;
                                            if (typeof data132 !== "string") {
                                              const err236 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err236];
                                              } else {
                                                vErrors.push(err236);
                                              }
                                              errors++;
                                            }
                                            if (!(data132 === "exitedReviewMode")) {
                                              const err237 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[16].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err237];
                                              } else {
                                                vErrors.push(err237);
                                              }
                                              errors++;
                                            }
                                            var valid76 = _errs375 === errors;
                                          } else {
                                            var valid76 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err238 = { instancePath, schemaPath: "#/oneOf/16/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err238];
                                    } else {
                                      vErrors.push(err238);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid0 = _errs369 === errors;
                                if (_valid0 && valid0) {
                                  valid0 = false;
                                  passing0 = [passing0, 16];
                                } else {
                                  if (_valid0) {
                                    valid0 = true;
                                    passing0 = 16;
                                  }
                                  const _errs377 = errors;
                                  if (errors === _errs377) {
                                    if (data && typeof data == "object" && !Array.isArray(data)) {
                                      let missing29;
                                      if (data.id === void 0 && (missing29 = "id") || data.type === void 0 && (missing29 = "type")) {
                                        const err239 = { instancePath, schemaPath: "#/oneOf/17/required", keyword: "required", params: { missingProperty: missing29 } };
                                        if (vErrors === null) {
                                          vErrors = [err239];
                                        } else {
                                          vErrors.push(err239);
                                        }
                                        errors++;
                                      } else {
                                        if (data.id !== void 0) {
                                          const _errs379 = errors;
                                          if (typeof data.id !== "string") {
                                            const err240 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/17/properties/id/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err240];
                                            } else {
                                              vErrors.push(err240);
                                            }
                                            errors++;
                                          }
                                          var valid77 = _errs379 === errors;
                                        } else {
                                          var valid77 = true;
                                        }
                                        if (valid77) {
                                          if (data.type !== void 0) {
                                            let data134 = data.type;
                                            const _errs381 = errors;
                                            if (typeof data134 !== "string") {
                                              const err241 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err241];
                                              } else {
                                                vErrors.push(err241);
                                              }
                                              errors++;
                                            }
                                            if (!(data134 === "contextCompaction")) {
                                              const err242 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/enum", keyword: "enum", params: { allowedValues: schema47.oneOf[17].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err242];
                                              } else {
                                                vErrors.push(err242);
                                              }
                                              errors++;
                                            }
                                            var valid77 = _errs381 === errors;
                                          } else {
                                            var valid77 = true;
                                          }
                                        }
                                      }
                                    } else {
                                      const err243 = { instancePath, schemaPath: "#/oneOf/17/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err243];
                                      } else {
                                        vErrors.push(err243);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid0 = _errs377 === errors;
                                  if (_valid0 && valid0) {
                                    valid0 = false;
                                    passing0 = [passing0, 17];
                                  } else {
                                    if (_valid0) {
                                      valid0 = true;
                                      passing0 = 17;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err244 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err244];
    } else {
      vErrors.push(err244);
    }
    errors++;
    validate42.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate42.errors = vErrors;
  return errors === 0;
}
function validate37(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.items === void 0 && (missing0 = "items") || data.status === void 0 && (missing0 = "status")) {
        validate37.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.completedAt !== void 0) {
          let data0 = data.completedAt;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0)) && data0 !== null) {
            validate37.errors = [{ instancePath: instancePath + "/completedAt", schemaPath: "#/properties/completedAt/type", keyword: "type", params: { type: schema43.properties.completedAt.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.durationMs !== void 0) {
            let data1 = data.durationMs;
            const _errs3 = errors;
            if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1)) && data1 !== null) {
              validate37.errors = [{ instancePath: instancePath + "/durationMs", schemaPath: "#/properties/durationMs/type", keyword: "type", params: { type: schema43.properties.durationMs.type } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.error !== void 0) {
              let data2 = data.error;
              const _errs5 = errors;
              const _errs6 = errors;
              let valid1 = false;
              const _errs7 = errors;
              if (!validate38(data2, { instancePath: instancePath + "/error", parentData: data, parentDataProperty: "error", rootData })) {
                vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs7 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs8 = errors;
                if (data2 !== null) {
                  const err0 = { instancePath: instancePath + "/error", schemaPath: "#/properties/error/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs8 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err1 = { instancePath: instancePath + "/error", schemaPath: "#/properties/error/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate37.errors = vErrors;
                return false;
              } else {
                errors = _errs6;
                if (vErrors !== null) {
                  if (_errs6) {
                    vErrors.length = _errs6;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.id !== void 0) {
                const _errs10 = errors;
                if (typeof data.id !== "string") {
                  validate37.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs10 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.items !== void 0) {
                  let data4 = data.items;
                  const _errs12 = errors;
                  if (errors === _errs12) {
                    if (Array.isArray(data4)) {
                      var valid2 = true;
                      const len0 = data4.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs14 = errors;
                        if (!validate42(data4[i0], { instancePath: instancePath + "/items/" + i0, parentData: data4, parentDataProperty: i0, rootData })) {
                          vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
                          errors = vErrors.length;
                        }
                        var valid2 = _errs14 === errors;
                        if (!valid2) {
                          break;
                        }
                      }
                    } else {
                      validate37.errors = [{ instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" } }];
                      return false;
                    }
                  }
                  var valid0 = _errs12 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.itemsView !== void 0) {
                    let data6 = data.itemsView;
                    const _errs15 = errors;
                    const _errs18 = errors;
                    let valid5 = false;
                    let passing0 = null;
                    const _errs19 = errors;
                    if (typeof data6 !== "string") {
                      const err2 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/0/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err2];
                      } else {
                        vErrors.push(err2);
                      }
                      errors++;
                    }
                    if (!(data6 === "notLoaded")) {
                      const err3 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema81.oneOf[0].enum } };
                      if (vErrors === null) {
                        vErrors = [err3];
                      } else {
                        vErrors.push(err3);
                      }
                      errors++;
                    }
                    var _valid1 = _errs19 === errors;
                    if (_valid1) {
                      valid5 = true;
                      passing0 = 0;
                    }
                    const _errs21 = errors;
                    if (typeof data6 !== "string") {
                      const err4 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/1/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err4];
                      } else {
                        vErrors.push(err4);
                      }
                      errors++;
                    }
                    if (!(data6 === "summary")) {
                      const err5 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema81.oneOf[1].enum } };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    var _valid1 = _errs21 === errors;
                    if (_valid1 && valid5) {
                      valid5 = false;
                      passing0 = [passing0, 1];
                    } else {
                      if (_valid1) {
                        valid5 = true;
                        passing0 = 1;
                      }
                      const _errs23 = errors;
                      if (typeof data6 !== "string") {
                        const err6 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/2/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err6];
                        } else {
                          vErrors.push(err6);
                        }
                        errors++;
                      }
                      if (!(data6 === "full")) {
                        const err7 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/2/enum", keyword: "enum", params: { allowedValues: schema81.oneOf[2].enum } };
                        if (vErrors === null) {
                          vErrors = [err7];
                        } else {
                          vErrors.push(err7);
                        }
                        errors++;
                      }
                      var _valid1 = _errs23 === errors;
                      if (_valid1 && valid5) {
                        valid5 = false;
                        passing0 = [passing0, 2];
                      } else {
                        if (_valid1) {
                          valid5 = true;
                          passing0 = 2;
                        }
                      }
                    }
                    if (!valid5) {
                      const err8 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
                      if (vErrors === null) {
                        vErrors = [err8];
                      } else {
                        vErrors.push(err8);
                      }
                      errors++;
                      validate37.errors = vErrors;
                      return false;
                    } else {
                      errors = _errs18;
                      if (vErrors !== null) {
                        if (_errs18) {
                          vErrors.length = _errs18;
                        } else {
                          vErrors = null;
                        }
                      }
                    }
                    var valid0 = _errs15 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.startedAt !== void 0) {
                      let data7 = data.startedAt;
                      const _errs25 = errors;
                      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7)) && data7 !== null) {
                        validate37.errors = [{ instancePath: instancePath + "/startedAt", schemaPath: "#/properties/startedAt/type", keyword: "type", params: { type: schema43.properties.startedAt.type } }];
                        return false;
                      }
                      var valid0 = _errs25 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.status !== void 0) {
                        let data8 = data.status;
                        const _errs27 = errors;
                        if (typeof data8 !== "string") {
                          validate37.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/TurnStatus/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        if (!(data8 === "completed" || data8 === "interrupted" || data8 === "failed" || data8 === "inProgress")) {
                          validate37.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/TurnStatus/enum", keyword: "enum", params: { allowedValues: schema82.enum } }];
                          return false;
                        }
                        var valid0 = _errs27 === errors;
                      } else {
                        var valid0 = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate37.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate37.errors = vErrors;
  return errors === 0;
}
function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.cliVersion === void 0 && (missing0 = "cliVersion") || data.createdAt === void 0 && (missing0 = "createdAt") || data.cwd === void 0 && (missing0 = "cwd") || data.ephemeral === void 0 && (missing0 = "ephemeral") || data.id === void 0 && (missing0 = "id") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.preview === void 0 && (missing0 = "preview") || data.sessionId === void 0 && (missing0 = "sessionId") || data.source === void 0 && (missing0 = "source") || data.status === void 0 && (missing0 = "status") || data.turns === void 0 && (missing0 = "turns") || data.updatedAt === void 0 && (missing0 = "updatedAt")) {
        validate28.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.agentNickname !== void 0) {
          let data0 = data.agentNickname;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate28.errors = [{ instancePath: instancePath + "/agentNickname", schemaPath: "#/properties/agentNickname/type", keyword: "type", params: { type: schema31.properties.agentNickname.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.agentRole !== void 0) {
            let data1 = data.agentRole;
            const _errs3 = errors;
            if (typeof data1 !== "string" && data1 !== null) {
              validate28.errors = [{ instancePath: instancePath + "/agentRole", schemaPath: "#/properties/agentRole/type", keyword: "type", params: { type: schema31.properties.agentRole.type } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.cliVersion !== void 0) {
              const _errs5 = errors;
              if (typeof data.cliVersion !== "string") {
                validate28.errors = [{ instancePath: instancePath + "/cliVersion", schemaPath: "#/properties/cliVersion/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.createdAt !== void 0) {
                let data3 = data.createdAt;
                const _errs7 = errors;
                if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                  validate28.errors = [{ instancePath: instancePath + "/createdAt", schemaPath: "#/properties/createdAt/type", keyword: "type", params: { type: "integer" } }];
                  return false;
                }
                var valid0 = _errs7 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.cwd !== void 0) {
                  const _errs9 = errors;
                  if (typeof data.cwd !== "string") {
                    validate28.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.ephemeral !== void 0) {
                    const _errs13 = errors;
                    if (typeof data.ephemeral !== "boolean") {
                      validate28.errors = [{ instancePath: instancePath + "/ephemeral", schemaPath: "#/properties/ephemeral/type", keyword: "type", params: { type: "boolean" } }];
                      return false;
                    }
                    var valid0 = _errs13 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.forkedFromId !== void 0) {
                      let data6 = data.forkedFromId;
                      const _errs15 = errors;
                      if (typeof data6 !== "string" && data6 !== null) {
                        validate28.errors = [{ instancePath: instancePath + "/forkedFromId", schemaPath: "#/properties/forkedFromId/type", keyword: "type", params: { type: schema31.properties.forkedFromId.type } }];
                        return false;
                      }
                      var valid0 = _errs15 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.gitInfo !== void 0) {
                        let data7 = data.gitInfo;
                        const _errs17 = errors;
                        const _errs18 = errors;
                        let valid3 = false;
                        const _errs19 = errors;
                        const _errs20 = errors;
                        if (errors === _errs20) {
                          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                            if (data7.branch !== void 0) {
                              let data8 = data7.branch;
                              const _errs22 = errors;
                              if (typeof data8 !== "string" && data8 !== null) {
                                const err0 = { instancePath: instancePath + "/gitInfo/branch", schemaPath: "#/definitions/v2/GitInfo/properties/branch/type", keyword: "type", params: { type: schema33.properties.branch.type } };
                                if (vErrors === null) {
                                  vErrors = [err0];
                                } else {
                                  vErrors.push(err0);
                                }
                                errors++;
                              }
                              var valid5 = _errs22 === errors;
                            } else {
                              var valid5 = true;
                            }
                            if (valid5) {
                              if (data7.originUrl !== void 0) {
                                let data9 = data7.originUrl;
                                const _errs24 = errors;
                                if (typeof data9 !== "string" && data9 !== null) {
                                  const err1 = { instancePath: instancePath + "/gitInfo/originUrl", schemaPath: "#/definitions/v2/GitInfo/properties/originUrl/type", keyword: "type", params: { type: schema33.properties.originUrl.type } };
                                  if (vErrors === null) {
                                    vErrors = [err1];
                                  } else {
                                    vErrors.push(err1);
                                  }
                                  errors++;
                                }
                                var valid5 = _errs24 === errors;
                              } else {
                                var valid5 = true;
                              }
                              if (valid5) {
                                if (data7.sha !== void 0) {
                                  let data10 = data7.sha;
                                  const _errs26 = errors;
                                  if (typeof data10 !== "string" && data10 !== null) {
                                    const err2 = { instancePath: instancePath + "/gitInfo/sha", schemaPath: "#/definitions/v2/GitInfo/properties/sha/type", keyword: "type", params: { type: schema33.properties.sha.type } };
                                    if (vErrors === null) {
                                      vErrors = [err2];
                                    } else {
                                      vErrors.push(err2);
                                    }
                                    errors++;
                                  }
                                  var valid5 = _errs26 === errors;
                                } else {
                                  var valid5 = true;
                                }
                              }
                            }
                          } else {
                            const err3 = { instancePath: instancePath + "/gitInfo", schemaPath: "#/definitions/v2/GitInfo/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err3];
                            } else {
                              vErrors.push(err3);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs19 === errors;
                        valid3 = valid3 || _valid0;
                        if (!valid3) {
                          const _errs28 = errors;
                          if (data7 !== null) {
                            const err4 = { instancePath: instancePath + "/gitInfo", schemaPath: "#/properties/gitInfo/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err4];
                            } else {
                              vErrors.push(err4);
                            }
                            errors++;
                          }
                          var _valid0 = _errs28 === errors;
                          valid3 = valid3 || _valid0;
                        }
                        if (!valid3) {
                          const err5 = { instancePath: instancePath + "/gitInfo", schemaPath: "#/properties/gitInfo/anyOf", keyword: "anyOf", params: {} };
                          if (vErrors === null) {
                            vErrors = [err5];
                          } else {
                            vErrors.push(err5);
                          }
                          errors++;
                          validate28.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs18;
                          if (vErrors !== null) {
                            if (_errs18) {
                              vErrors.length = _errs18;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid0 = _errs17 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.id !== void 0) {
                          const _errs30 = errors;
                          if (typeof data.id !== "string") {
                            validate28.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          var valid0 = _errs30 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.modelProvider !== void 0) {
                            const _errs32 = errors;
                            if (typeof data.modelProvider !== "string") {
                              validate28.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                              return false;
                            }
                            var valid0 = _errs32 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.name !== void 0) {
                              let data13 = data.name;
                              const _errs34 = errors;
                              if (typeof data13 !== "string" && data13 !== null) {
                                validate28.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: schema31.properties.name.type } }];
                                return false;
                              }
                              var valid0 = _errs34 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.parentThreadId !== void 0) {
                                let data14 = data.parentThreadId;
                                const _errs36 = errors;
                                if (typeof data14 !== "string" && data14 !== null) {
                                  validate28.errors = [{ instancePath: instancePath + "/parentThreadId", schemaPath: "#/properties/parentThreadId/type", keyword: "type", params: { type: schema31.properties.parentThreadId.type } }];
                                  return false;
                                }
                                var valid0 = _errs36 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.path !== void 0) {
                                  let data15 = data.path;
                                  const _errs38 = errors;
                                  if (typeof data15 !== "string" && data15 !== null) {
                                    validate28.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: schema31.properties.path.type } }];
                                    return false;
                                  }
                                  var valid0 = _errs38 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.preview !== void 0) {
                                    const _errs40 = errors;
                                    if (typeof data.preview !== "string") {
                                      validate28.errors = [{ instancePath: instancePath + "/preview", schemaPath: "#/properties/preview/type", keyword: "type", params: { type: "string" } }];
                                      return false;
                                    }
                                    var valid0 = _errs40 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.recencyAt !== void 0) {
                                      let data17 = data.recencyAt;
                                      const _errs42 = errors;
                                      if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17)) && data17 !== null) {
                                        validate28.errors = [{ instancePath: instancePath + "/recencyAt", schemaPath: "#/properties/recencyAt/type", keyword: "type", params: { type: schema31.properties.recencyAt.type } }];
                                        return false;
                                      }
                                      var valid0 = _errs42 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.section !== void 0) {
                                        let data18 = data.section;
                                        const _errs44 = errors;
                                        const _errs45 = errors;
                                        let valid6 = false;
                                        const _errs46 = errors;
                                        if (!validate29(data18, { instancePath: instancePath + "/section", parentData: data, parentDataProperty: "section", rootData })) {
                                          vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                                          errors = vErrors.length;
                                        }
                                        var _valid1 = _errs46 === errors;
                                        valid6 = valid6 || _valid1;
                                        if (!valid6) {
                                          const _errs47 = errors;
                                          if (data18 !== null) {
                                            const err6 = { instancePath: instancePath + "/section", schemaPath: "#/properties/section/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                            if (vErrors === null) {
                                              vErrors = [err6];
                                            } else {
                                              vErrors.push(err6);
                                            }
                                            errors++;
                                          }
                                          var _valid1 = _errs47 === errors;
                                          valid6 = valid6 || _valid1;
                                        }
                                        if (!valid6) {
                                          const err7 = { instancePath: instancePath + "/section", schemaPath: "#/properties/section/anyOf", keyword: "anyOf", params: {} };
                                          if (vErrors === null) {
                                            vErrors = [err7];
                                          } else {
                                            vErrors.push(err7);
                                          }
                                          errors++;
                                          validate28.errors = vErrors;
                                          return false;
                                        } else {
                                          errors = _errs45;
                                          if (vErrors !== null) {
                                            if (_errs45) {
                                              vErrors.length = _errs45;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                        var valid0 = _errs44 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.sectionEnteredAt !== void 0) {
                                          let data19 = data.sectionEnteredAt;
                                          const _errs49 = errors;
                                          if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19)) && data19 !== null) {
                                            validate28.errors = [{ instancePath: instancePath + "/sectionEnteredAt", schemaPath: "#/properties/sectionEnteredAt/type", keyword: "type", params: { type: schema31.properties.sectionEnteredAt.type } }];
                                            return false;
                                          }
                                          var valid0 = _errs49 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.sessionId !== void 0) {
                                            const _errs51 = errors;
                                            if (typeof data.sessionId !== "string") {
                                              validate28.errors = [{ instancePath: instancePath + "/sessionId", schemaPath: "#/properties/sessionId/type", keyword: "type", params: { type: "string" } }];
                                              return false;
                                            }
                                            var valid0 = _errs51 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                          if (valid0) {
                                            if (data.source !== void 0) {
                                              const _errs53 = errors;
                                              if (!validate31(data.source, { instancePath: instancePath + "/source", parentData: data, parentDataProperty: "source", rootData })) {
                                                vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                                                errors = vErrors.length;
                                              }
                                              var valid0 = _errs53 === errors;
                                            } else {
                                              var valid0 = true;
                                            }
                                            if (valid0) {
                                              if (data.status !== void 0) {
                                                const _errs55 = errors;
                                                if (!validate35(data.status, { instancePath: instancePath + "/status", parentData: data, parentDataProperty: "status", rootData })) {
                                                  vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
                                                  errors = vErrors.length;
                                                }
                                                var valid0 = _errs55 === errors;
                                              } else {
                                                var valid0 = true;
                                              }
                                              if (valid0) {
                                                if (data.threadSource !== void 0) {
                                                  let data23 = data.threadSource;
                                                  const _errs57 = errors;
                                                  const _errs58 = errors;
                                                  let valid9 = false;
                                                  const _errs59 = errors;
                                                  if (typeof data23 !== "string") {
                                                    const err8 = { instancePath: instancePath + "/threadSource", schemaPath: "#/definitions/v2/ThreadSource/type", keyword: "type", params: { type: "string" } };
                                                    if (vErrors === null) {
                                                      vErrors = [err8];
                                                    } else {
                                                      vErrors.push(err8);
                                                    }
                                                    errors++;
                                                  }
                                                  var _valid2 = _errs59 === errors;
                                                  valid9 = valid9 || _valid2;
                                                  if (!valid9) {
                                                    const _errs62 = errors;
                                                    if (data23 !== null) {
                                                      const err9 = { instancePath: instancePath + "/threadSource", schemaPath: "#/properties/threadSource/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                      if (vErrors === null) {
                                                        vErrors = [err9];
                                                      } else {
                                                        vErrors.push(err9);
                                                      }
                                                      errors++;
                                                    }
                                                    var _valid2 = _errs62 === errors;
                                                    valid9 = valid9 || _valid2;
                                                  }
                                                  if (!valid9) {
                                                    const err10 = { instancePath: instancePath + "/threadSource", schemaPath: "#/properties/threadSource/anyOf", keyword: "anyOf", params: {} };
                                                    if (vErrors === null) {
                                                      vErrors = [err10];
                                                    } else {
                                                      vErrors.push(err10);
                                                    }
                                                    errors++;
                                                    validate28.errors = vErrors;
                                                    return false;
                                                  } else {
                                                    errors = _errs58;
                                                    if (vErrors !== null) {
                                                      if (_errs58) {
                                                        vErrors.length = _errs58;
                                                      } else {
                                                        vErrors = null;
                                                      }
                                                    }
                                                  }
                                                  var valid0 = _errs57 === errors;
                                                } else {
                                                  var valid0 = true;
                                                }
                                                if (valid0) {
                                                  if (data.turns !== void 0) {
                                                    let data24 = data.turns;
                                                    const _errs64 = errors;
                                                    if (errors === _errs64) {
                                                      if (Array.isArray(data24)) {
                                                        var valid11 = true;
                                                        const len0 = data24.length;
                                                        for (let i0 = 0; i0 < len0; i0++) {
                                                          const _errs66 = errors;
                                                          if (!validate37(data24[i0], { instancePath: instancePath + "/turns/" + i0, parentData: data24, parentDataProperty: i0, rootData })) {
                                                            vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
                                                            errors = vErrors.length;
                                                          }
                                                          var valid11 = _errs66 === errors;
                                                          if (!valid11) {
                                                            break;
                                                          }
                                                        }
                                                      } else {
                                                        validate28.errors = [{ instancePath: instancePath + "/turns", schemaPath: "#/properties/turns/type", keyword: "type", params: { type: "array" } }];
                                                        return false;
                                                      }
                                                    }
                                                    var valid0 = _errs64 === errors;
                                                  } else {
                                                    var valid0 = true;
                                                  }
                                                  if (valid0) {
                                                    if (data.updatedAt !== void 0) {
                                                      let data26 = data.updatedAt;
                                                      const _errs67 = errors;
                                                      if (!(typeof data26 == "number" && (!(data26 % 1) && !isNaN(data26)) && isFinite(data26))) {
                                                        validate28.errors = [{ instancePath: instancePath + "/updatedAt", schemaPath: "#/properties/updatedAt/type", keyword: "type", params: { type: "integer" } }];
                                                        return false;
                                                      }
                                                      var valid0 = _errs67 === errors;
                                                    } else {
                                                      var valid0 = true;
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate28.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate28.errors = vErrors;
  return errors === 0;
}
function validate27(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.data === void 0 && (missing0 = "data")) {
        validate27.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.backwardsCursor !== void 0) {
          let data0 = data.backwardsCursor;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate27.errors = [{ instancePath: instancePath + "/backwardsCursor", schemaPath: "#/properties/backwardsCursor/type", keyword: "type", params: { type: schema30.properties.backwardsCursor.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.data !== void 0) {
            let data1 = data.data;
            const _errs3 = errors;
            if (errors === _errs3) {
              if (Array.isArray(data1)) {
                var valid1 = true;
                const len0 = data1.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  const _errs5 = errors;
                  if (!validate28(data1[i0], { instancePath: instancePath + "/data/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
                    errors = vErrors.length;
                  }
                  var valid1 = _errs5 === errors;
                  if (!valid1) {
                    break;
                  }
                }
              } else {
                validate27.errors = [{ instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: "array" } }];
                return false;
              }
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.nextCursor !== void 0) {
              let data3 = data.nextCursor;
              const _errs6 = errors;
              if (typeof data3 !== "string" && data3 !== null) {
                validate27.errors = [{ instancePath: instancePath + "/nextCursor", schemaPath: "#/properties/nextCursor/type", keyword: "type", params: { type: schema30.properties.nextCursor.type } }];
                return false;
              }
              var valid0 = _errs6 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate27.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate27.errors = vErrors;
  return errors === 0;
}
function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate27(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
    errors = vErrors.length;
  }
  validate26.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionAttachResponse = validate59;
var schema85 = { "properties": { "headCommitId": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" }, "tokenUsage": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadTokenUsage" }, { "type": "null" }] } }, "required": ["thread"], "type": "object" };
var schema86 = { "properties": { "last": { "$ref": "#/definitions/v2/TokenUsageBreakdown" }, "modelContextWindow": { "format": "int64", "type": ["integer", "null"] }, "total": { "$ref": "#/definitions/v2/TokenUsageBreakdown" } }, "required": ["last", "total"], "type": "object" };
function validate63(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.last === void 0 && (missing0 = "last") || data.total === void 0 && (missing0 = "total")) {
        validate63.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.last !== void 0) {
          let data0 = data.last;
          const _errs1 = errors;
          const _errs2 = errors;
          if (errors === _errs2) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing1;
              if (data0.cachedInputTokens === void 0 && (missing1 = "cachedInputTokens") || data0.inputTokens === void 0 && (missing1 = "inputTokens") || data0.outputTokens === void 0 && (missing1 = "outputTokens") || data0.reasoningOutputTokens === void 0 && (missing1 = "reasoningOutputTokens") || data0.totalTokens === void 0 && (missing1 = "totalTokens")) {
                validate63.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.cacheWriteInputTokens !== void 0) {
                  let data1 = data0.cacheWriteInputTokens;
                  const _errs4 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate63.errors = [{ instancePath: instancePath + "/last/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  var valid2 = _errs4 === errors;
                } else {
                  var valid2 = true;
                }
                if (valid2) {
                  if (data0.cachedInputTokens !== void 0) {
                    let data2 = data0.cachedInputTokens;
                    const _errs6 = errors;
                    if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                      validate63.errors = [{ instancePath: instancePath + "/last/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
                      return false;
                    }
                    var valid2 = _errs6 === errors;
                  } else {
                    var valid2 = true;
                  }
                  if (valid2) {
                    if (data0.inputTokens !== void 0) {
                      let data3 = data0.inputTokens;
                      const _errs8 = errors;
                      if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                        validate63.errors = [{ instancePath: instancePath + "/last/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
                        return false;
                      }
                      var valid2 = _errs8 === errors;
                    } else {
                      var valid2 = true;
                    }
                    if (valid2) {
                      if (data0.outputTokens !== void 0) {
                        let data4 = data0.outputTokens;
                        const _errs10 = errors;
                        if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                          validate63.errors = [{ instancePath: instancePath + "/last/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        var valid2 = _errs10 === errors;
                      } else {
                        var valid2 = true;
                      }
                      if (valid2) {
                        if (data0.reasoningOutputTokens !== void 0) {
                          let data5 = data0.reasoningOutputTokens;
                          const _errs12 = errors;
                          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                            validate63.errors = [{ instancePath: instancePath + "/last/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
                            return false;
                          }
                          var valid2 = _errs12 === errors;
                        } else {
                          var valid2 = true;
                        }
                        if (valid2) {
                          if (data0.totalTokens !== void 0) {
                            let data6 = data0.totalTokens;
                            const _errs14 = errors;
                            if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                              validate63.errors = [{ instancePath: instancePath + "/last/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
                              return false;
                            }
                            var valid2 = _errs14 === errors;
                          } else {
                            var valid2 = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            } else {
              validate63.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
              return false;
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.modelContextWindow !== void 0) {
            let data7 = data.modelContextWindow;
            const _errs16 = errors;
            if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7)) && data7 !== null) {
              validate63.errors = [{ instancePath: instancePath + "/modelContextWindow", schemaPath: "#/properties/modelContextWindow/type", keyword: "type", params: { type: schema86.properties.modelContextWindow.type } }];
              return false;
            }
            var valid0 = _errs16 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.total !== void 0) {
              let data8 = data.total;
              const _errs18 = errors;
              const _errs19 = errors;
              if (errors === _errs19) {
                if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                  let missing2;
                  if (data8.cachedInputTokens === void 0 && (missing2 = "cachedInputTokens") || data8.inputTokens === void 0 && (missing2 = "inputTokens") || data8.outputTokens === void 0 && (missing2 = "outputTokens") || data8.reasoningOutputTokens === void 0 && (missing2 = "reasoningOutputTokens") || data8.totalTokens === void 0 && (missing2 = "totalTokens")) {
                    validate63.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing2 } }];
                    return false;
                  } else {
                    if (data8.cacheWriteInputTokens !== void 0) {
                      let data9 = data8.cacheWriteInputTokens;
                      const _errs21 = errors;
                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                        validate63.errors = [{ instancePath: instancePath + "/total/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
                        return false;
                      }
                      var valid4 = _errs21 === errors;
                    } else {
                      var valid4 = true;
                    }
                    if (valid4) {
                      if (data8.cachedInputTokens !== void 0) {
                        let data10 = data8.cachedInputTokens;
                        const _errs23 = errors;
                        if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                          validate63.errors = [{ instancePath: instancePath + "/total/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        var valid4 = _errs23 === errors;
                      } else {
                        var valid4 = true;
                      }
                      if (valid4) {
                        if (data8.inputTokens !== void 0) {
                          let data11 = data8.inputTokens;
                          const _errs25 = errors;
                          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                            validate63.errors = [{ instancePath: instancePath + "/total/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
                            return false;
                          }
                          var valid4 = _errs25 === errors;
                        } else {
                          var valid4 = true;
                        }
                        if (valid4) {
                          if (data8.outputTokens !== void 0) {
                            let data12 = data8.outputTokens;
                            const _errs27 = errors;
                            if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
                              validate63.errors = [{ instancePath: instancePath + "/total/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
                              return false;
                            }
                            var valid4 = _errs27 === errors;
                          } else {
                            var valid4 = true;
                          }
                          if (valid4) {
                            if (data8.reasoningOutputTokens !== void 0) {
                              let data13 = data8.reasoningOutputTokens;
                              const _errs29 = errors;
                              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                                validate63.errors = [{ instancePath: instancePath + "/total/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
                                return false;
                              }
                              var valid4 = _errs29 === errors;
                            } else {
                              var valid4 = true;
                            }
                            if (valid4) {
                              if (data8.totalTokens !== void 0) {
                                let data14 = data8.totalTokens;
                                const _errs31 = errors;
                                if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
                                  validate63.errors = [{ instancePath: instancePath + "/total/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
                                  return false;
                                }
                                var valid4 = _errs31 === errors;
                              } else {
                                var valid4 = true;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  validate63.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
                  return false;
                }
              }
              var valid0 = _errs18 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate63.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate63.errors = vErrors;
  return errors === 0;
}
function validate61(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate61.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.headCommitId !== void 0) {
          let data0 = data.headCommitId;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate61.errors = [{ instancePath: instancePath + "/headCommitId", schemaPath: "#/properties/headCommitId/type", keyword: "type", params: { type: schema85.properties.headCommitId.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.thread !== void 0) {
            const _errs3 = errors;
            if (!validate28(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.tokenUsage !== void 0) {
              let data2 = data.tokenUsage;
              const _errs4 = errors;
              const _errs5 = errors;
              let valid1 = false;
              const _errs6 = errors;
              if (!validate63(data2, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
                vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
                errors = vErrors.length;
              }
              var _valid0 = _errs6 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs7 = errors;
                if (data2 !== null) {
                  const err0 = { instancePath: instancePath + "/tokenUsage", schemaPath: "#/properties/tokenUsage/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                }
                var _valid0 = _errs7 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err1 = { instancePath: instancePath + "/tokenUsage", schemaPath: "#/properties/tokenUsage/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
                validate61.errors = vErrors;
                return false;
              } else {
                errors = _errs5;
                if (vErrors !== null) {
                  if (_errs5) {
                    vErrors.length = _errs5;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate61.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate61.errors = vErrors;
  return errors === 0;
}
function validate60(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.snapshot === void 0 && (missing0 = "snapshot") || data.subscriptionId === void 0 && (missing0 = "subscriptionId")) {
        validate60.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.snapshot !== void 0) {
          const _errs1 = errors;
          if (!validate61(data.snapshot, { instancePath: instancePath + "/snapshot", parentData: data, parentDataProperty: "snapshot", rootData })) {
            vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.subscriptionId !== void 0) {
            const _errs2 = errors;
            if (typeof data.subscriptionId !== "string") {
              validate60.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate60.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate60.errors = vErrors;
  return errors === 0;
}
function validate59(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate60(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
    errors = vErrors.length;
  }
  validate59.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionClosedNotification = validate67;
var schema91 = { "enum": ["backpressure"], "type": "string" };
function validate68(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.reason === void 0 && (missing0 = "reason") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate68.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.reason !== void 0) {
          let data0 = data.reason;
          const _errs1 = errors;
          if (typeof data0 !== "string") {
            validate68.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "backpressure")) {
            validate68.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/enum", keyword: "enum", params: { allowedValues: schema91.enum } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.subscriptionId !== void 0) {
            const _errs4 = errors;
            if (typeof data.subscriptionId !== "string") {
              validate68.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs4 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.threadId !== void 0) {
              const _errs6 = errors;
              if (typeof data.threadId !== "string") {
                validate68.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs6 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate68.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate68.errors = vErrors;
  return errors === 0;
}
function validate67(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate68(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
    errors = vErrors.length;
  }
  validate67.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDeltaNotification = validate70;
var schema94 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/AgentMessageDeltaNotification" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "AgentMessageThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryTextDeltaNotification" }, "type": { "enum": ["reasoningSummaryText"], "title": "ReasoningSummaryTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryTextThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryPartAddedNotification" }, "type": { "enum": ["reasoningSummaryPartAdded"], "title": "ReasoningSummaryPartAddedThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryPartAddedThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningTextDeltaNotification" }, "type": { "enum": ["reasoningText"], "title": "ReasoningTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningTextThreadProjectionDelta", "type": "object" }] };
function validate72(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.notification === void 0 && (missing0 = "notification") || data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.notification !== void 0) {
          let data0 = data.notification;
          const _errs3 = errors;
          const _errs4 = errors;
          if (errors === _errs4) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing1;
              if (data0.delta === void 0 && (missing1 = "delta") || data0.itemId === void 0 && (missing1 = "itemId") || data0.threadId === void 0 && (missing1 = "threadId") || data0.turnId === void 0 && (missing1 = "turnId")) {
                const err1 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/required", keyword: "required", params: { missingProperty: missing1 } };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
              } else {
                if (data0.delta !== void 0) {
                  const _errs6 = errors;
                  if (typeof data0.delta !== "string") {
                    const err2 = { instancePath: instancePath + "/notification/delta", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/properties/delta/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err2];
                    } else {
                      vErrors.push(err2);
                    }
                    errors++;
                  }
                  var valid3 = _errs6 === errors;
                } else {
                  var valid3 = true;
                }
                if (valid3) {
                  if (data0.itemId !== void 0) {
                    const _errs8 = errors;
                    if (typeof data0.itemId !== "string") {
                      const err3 = { instancePath: instancePath + "/notification/itemId", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/properties/itemId/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err3];
                      } else {
                        vErrors.push(err3);
                      }
                      errors++;
                    }
                    var valid3 = _errs8 === errors;
                  } else {
                    var valid3 = true;
                  }
                  if (valid3) {
                    if (data0.threadId !== void 0) {
                      const _errs10 = errors;
                      if (typeof data0.threadId !== "string") {
                        const err4 = { instancePath: instancePath + "/notification/threadId", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/properties/threadId/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err4];
                        } else {
                          vErrors.push(err4);
                        }
                        errors++;
                      }
                      var valid3 = _errs10 === errors;
                    } else {
                      var valid3 = true;
                    }
                    if (valid3) {
                      if (data0.turnId !== void 0) {
                        const _errs12 = errors;
                        if (typeof data0.turnId !== "string") {
                          const err5 = { instancePath: instancePath + "/notification/turnId", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/properties/turnId/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err5];
                          } else {
                            vErrors.push(err5);
                          }
                          errors++;
                        }
                        var valid3 = _errs12 === errors;
                      } else {
                        var valid3 = true;
                      }
                    }
                  }
                }
              }
            } else {
              const err6 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/AgentMessageDeltaNotification/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.type !== void 0) {
            let data5 = data.type;
            const _errs14 = errors;
            if (typeof data5 !== "string") {
              const err7 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (!(data5 === "agentMessage")) {
              const err8 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema94.oneOf[0].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            var valid1 = _errs14 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      const err9 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs16 = errors;
  if (errors === _errs16) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing2;
      if (data.notification === void 0 && (missing2 = "notification") || data.type === void 0 && (missing2 = "type")) {
        const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing2 } };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      } else {
        if (data.notification !== void 0) {
          let data6 = data.notification;
          const _errs18 = errors;
          const _errs19 = errors;
          if (errors === _errs19) {
            if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
              let missing3;
              if (data6.delta === void 0 && (missing3 = "delta") || data6.itemId === void 0 && (missing3 = "itemId") || data6.summaryIndex === void 0 && (missing3 = "summaryIndex") || data6.threadId === void 0 && (missing3 = "threadId") || data6.turnId === void 0 && (missing3 = "turnId")) {
                const err11 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/required", keyword: "required", params: { missingProperty: missing3 } };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              } else {
                if (data6.delta !== void 0) {
                  const _errs21 = errors;
                  if (typeof data6.delta !== "string") {
                    const err12 = { instancePath: instancePath + "/notification/delta", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/properties/delta/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                  var valid6 = _errs21 === errors;
                } else {
                  var valid6 = true;
                }
                if (valid6) {
                  if (data6.itemId !== void 0) {
                    const _errs23 = errors;
                    if (typeof data6.itemId !== "string") {
                      const err13 = { instancePath: instancePath + "/notification/itemId", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/properties/itemId/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err13];
                      } else {
                        vErrors.push(err13);
                      }
                      errors++;
                    }
                    var valid6 = _errs23 === errors;
                  } else {
                    var valid6 = true;
                  }
                  if (valid6) {
                    if (data6.summaryIndex !== void 0) {
                      let data9 = data6.summaryIndex;
                      const _errs25 = errors;
                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                        const err14 = { instancePath: instancePath + "/notification/summaryIndex", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/properties/summaryIndex/type", keyword: "type", params: { type: "integer" } };
                        if (vErrors === null) {
                          vErrors = [err14];
                        } else {
                          vErrors.push(err14);
                        }
                        errors++;
                      }
                      var valid6 = _errs25 === errors;
                    } else {
                      var valid6 = true;
                    }
                    if (valid6) {
                      if (data6.threadId !== void 0) {
                        const _errs27 = errors;
                        if (typeof data6.threadId !== "string") {
                          const err15 = { instancePath: instancePath + "/notification/threadId", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/properties/threadId/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err15];
                          } else {
                            vErrors.push(err15);
                          }
                          errors++;
                        }
                        var valid6 = _errs27 === errors;
                      } else {
                        var valid6 = true;
                      }
                      if (valid6) {
                        if (data6.turnId !== void 0) {
                          const _errs29 = errors;
                          if (typeof data6.turnId !== "string") {
                            const err16 = { instancePath: instancePath + "/notification/turnId", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/properties/turnId/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err16];
                            } else {
                              vErrors.push(err16);
                            }
                            errors++;
                          }
                          var valid6 = _errs29 === errors;
                        } else {
                          var valid6 = true;
                        }
                      }
                    }
                  }
                }
              }
            } else {
              const err17 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningSummaryTextDeltaNotification/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          var valid4 = _errs18 === errors;
        } else {
          var valid4 = true;
        }
        if (valid4) {
          if (data.type !== void 0) {
            let data12 = data.type;
            const _errs31 = errors;
            if (typeof data12 !== "string") {
              const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (!(data12 === "reasoningSummaryText")) {
              const err19 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema94.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            var valid4 = _errs31 === errors;
          } else {
            var valid4 = true;
          }
        }
      }
    } else {
      const err20 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err20];
      } else {
        vErrors.push(err20);
      }
      errors++;
    }
  }
  var _valid0 = _errs16 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs33 = errors;
    if (errors === _errs33) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing4;
        if (data.notification === void 0 && (missing4 = "notification") || data.type === void 0 && (missing4 = "type")) {
          const err21 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing4 } };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        } else {
          if (data.notification !== void 0) {
            let data13 = data.notification;
            const _errs35 = errors;
            const _errs36 = errors;
            if (errors === _errs36) {
              if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
                let missing5;
                if (data13.itemId === void 0 && (missing5 = "itemId") || data13.summaryIndex === void 0 && (missing5 = "summaryIndex") || data13.threadId === void 0 && (missing5 = "threadId") || data13.turnId === void 0 && (missing5 = "turnId")) {
                  const err22 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/required", keyword: "required", params: { missingProperty: missing5 } };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                } else {
                  if (data13.itemId !== void 0) {
                    const _errs38 = errors;
                    if (typeof data13.itemId !== "string") {
                      const err23 = { instancePath: instancePath + "/notification/itemId", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/properties/itemId/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                    var valid9 = _errs38 === errors;
                  } else {
                    var valid9 = true;
                  }
                  if (valid9) {
                    if (data13.summaryIndex !== void 0) {
                      let data15 = data13.summaryIndex;
                      const _errs40 = errors;
                      if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
                        const err24 = { instancePath: instancePath + "/notification/summaryIndex", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/properties/summaryIndex/type", keyword: "type", params: { type: "integer" } };
                        if (vErrors === null) {
                          vErrors = [err24];
                        } else {
                          vErrors.push(err24);
                        }
                        errors++;
                      }
                      var valid9 = _errs40 === errors;
                    } else {
                      var valid9 = true;
                    }
                    if (valid9) {
                      if (data13.threadId !== void 0) {
                        const _errs42 = errors;
                        if (typeof data13.threadId !== "string") {
                          const err25 = { instancePath: instancePath + "/notification/threadId", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/properties/threadId/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err25];
                          } else {
                            vErrors.push(err25);
                          }
                          errors++;
                        }
                        var valid9 = _errs42 === errors;
                      } else {
                        var valid9 = true;
                      }
                      if (valid9) {
                        if (data13.turnId !== void 0) {
                          const _errs44 = errors;
                          if (typeof data13.turnId !== "string") {
                            const err26 = { instancePath: instancePath + "/notification/turnId", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/properties/turnId/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err26];
                            } else {
                              vErrors.push(err26);
                            }
                            errors++;
                          }
                          var valid9 = _errs44 === errors;
                        } else {
                          var valid9 = true;
                        }
                      }
                    }
                  }
                }
              } else {
                const err27 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningSummaryPartAddedNotification/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
            var valid7 = _errs35 === errors;
          } else {
            var valid7 = true;
          }
          if (valid7) {
            if (data.type !== void 0) {
              let data18 = data.type;
              const _errs46 = errors;
              if (typeof data18 !== "string") {
                const err28 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
              if (!(data18 === "reasoningSummaryPartAdded")) {
                const err29 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema94.oneOf[2].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              var valid7 = _errs46 === errors;
            } else {
              var valid7 = true;
            }
          }
        }
      } else {
        const err30 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    var _valid0 = _errs33 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs48 = errors;
      if (errors === _errs48) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing6;
          if (data.notification === void 0 && (missing6 = "notification") || data.type === void 0 && (missing6 = "type")) {
            const err31 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing6 } };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          } else {
            if (data.notification !== void 0) {
              let data19 = data.notification;
              const _errs50 = errors;
              const _errs51 = errors;
              if (errors === _errs51) {
                if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
                  let missing7;
                  if (data19.contentIndex === void 0 && (missing7 = "contentIndex") || data19.delta === void 0 && (missing7 = "delta") || data19.itemId === void 0 && (missing7 = "itemId") || data19.threadId === void 0 && (missing7 = "threadId") || data19.turnId === void 0 && (missing7 = "turnId")) {
                    const err32 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/required", keyword: "required", params: { missingProperty: missing7 } };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  } else {
                    if (data19.contentIndex !== void 0) {
                      let data20 = data19.contentIndex;
                      const _errs53 = errors;
                      if (!(typeof data20 == "number" && (!(data20 % 1) && !isNaN(data20)) && isFinite(data20))) {
                        const err33 = { instancePath: instancePath + "/notification/contentIndex", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/properties/contentIndex/type", keyword: "type", params: { type: "integer" } };
                        if (vErrors === null) {
                          vErrors = [err33];
                        } else {
                          vErrors.push(err33);
                        }
                        errors++;
                      }
                      var valid12 = _errs53 === errors;
                    } else {
                      var valid12 = true;
                    }
                    if (valid12) {
                      if (data19.delta !== void 0) {
                        const _errs55 = errors;
                        if (typeof data19.delta !== "string") {
                          const err34 = { instancePath: instancePath + "/notification/delta", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/properties/delta/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err34];
                          } else {
                            vErrors.push(err34);
                          }
                          errors++;
                        }
                        var valid12 = _errs55 === errors;
                      } else {
                        var valid12 = true;
                      }
                      if (valid12) {
                        if (data19.itemId !== void 0) {
                          const _errs57 = errors;
                          if (typeof data19.itemId !== "string") {
                            const err35 = { instancePath: instancePath + "/notification/itemId", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/properties/itemId/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err35];
                            } else {
                              vErrors.push(err35);
                            }
                            errors++;
                          }
                          var valid12 = _errs57 === errors;
                        } else {
                          var valid12 = true;
                        }
                        if (valid12) {
                          if (data19.threadId !== void 0) {
                            const _errs59 = errors;
                            if (typeof data19.threadId !== "string") {
                              const err36 = { instancePath: instancePath + "/notification/threadId", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/properties/threadId/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err36];
                              } else {
                                vErrors.push(err36);
                              }
                              errors++;
                            }
                            var valid12 = _errs59 === errors;
                          } else {
                            var valid12 = true;
                          }
                          if (valid12) {
                            if (data19.turnId !== void 0) {
                              const _errs61 = errors;
                              if (typeof data19.turnId !== "string") {
                                const err37 = { instancePath: instancePath + "/notification/turnId", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/properties/turnId/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err37];
                                } else {
                                  vErrors.push(err37);
                                }
                                errors++;
                              }
                              var valid12 = _errs61 === errors;
                            } else {
                              var valid12 = true;
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  const err38 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ReasoningTextDeltaNotification/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              }
              var valid10 = _errs50 === errors;
            } else {
              var valid10 = true;
            }
            if (valid10) {
              if (data.type !== void 0) {
                let data25 = data.type;
                const _errs63 = errors;
                if (typeof data25 !== "string") {
                  const err39 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if (!(data25 === "reasoningText")) {
                  const err40 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema94.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
                var valid10 = _errs63 === errors;
              } else {
                var valid10 = true;
              }
            }
          }
        } else {
          const err41 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
      }
      var _valid0 = _errs48 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err42 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err42];
    } else {
      vErrors.push(err42);
    }
    errors++;
    validate72.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate72.errors = vErrors;
  return errors === 0;
}
function validate71(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.delta === void 0 && (missing0 = "delta") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate71.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.delta !== void 0) {
          const _errs1 = errors;
          if (!validate72(data.delta, { instancePath: instancePath + "/delta", parentData: data, parentDataProperty: "delta", rootData })) {
            vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.subscriptionId !== void 0) {
            const _errs2 = errors;
            if (typeof data.subscriptionId !== "string") {
              validate71.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.threadId !== void 0) {
              const _errs4 = errors;
              if (typeof data.threadId !== "string") {
                validate71.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate71.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate71.errors = vErrors;
  return errors === 0;
}
function validate70(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate71(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
    errors = vErrors.length;
  }
  validate70.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDetachResponse = validate75;
var schema101 = { "enum": ["detached", "notSubscribed", "notLoaded"], "type": "string" };
function validate76(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate76.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.status !== void 0) {
          let data0 = data.status;
          if (typeof data0 !== "string") {
            validate76.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "detached" || data0 === "notSubscribed" || data0 === "notLoaded")) {
            validate76.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/enum", keyword: "enum", params: { allowedValues: schema101.enum } }];
            return false;
          }
        }
      }
    } else {
      validate76.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate76.errors = vErrors;
  return errors === 0;
}
function validate75(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate76(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
    errors = vErrors.length;
  }
  validate75.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionEventNotification = validate78;
var schema103 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "commitId": { "type": "string" }, "event": { "$ref": "#/definitions/v2/ThreadProjectionEvent" }, "parentCommitId": { "type": ["string", "null"] }, "subscriptionId": { "type": "string" }, "threadId": { "type": "string" } }, "required": ["commitId", "event", "subscriptionId", "threadId"], "title": "ThreadProjectionEventNotification", "type": "object" };
var schema104 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/TurnStartedNotification" }, "type": { "enum": ["turnStarted"], "title": "TurnStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/TurnCompletedNotification" }, "type": { "enum": ["turnCompleted"], "title": "TurnCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemStartedNotification" }, "type": { "enum": ["itemStarted"], "title": "ItemStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemCompletedNotification" }, "type": { "enum": ["itemCompleted"], "title": "ItemCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ThreadTokenUsageUpdatedNotification" }, "type": { "enum": ["tokenUsageUpdated"], "title": "TokenUsageUpdatedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TokenUsageUpdatedThreadProjectionEvent", "type": "object" }] };
function validate81(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate81.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate81.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turn !== void 0) {
            const _errs3 = errors;
            if (!validate37(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
              vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate81.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate81.errors = vErrors;
  return errors === 0;
}
function validate84(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate84.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate84.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turn !== void 0) {
            const _errs3 = errors;
            if (!validate37(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
              vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate84.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate84.errors = vErrors;
  return errors === 0;
}
function validate87(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.item === void 0 && (missing0 = "item") || data.startedAtMs === void 0 && (missing0 = "startedAtMs") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate87.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.item !== void 0) {
          const _errs1 = errors;
          if (!validate42(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
            vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.startedAtMs !== void 0) {
            let data1 = data.startedAtMs;
            const _errs2 = errors;
            if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
              validate87.errors = [{ instancePath: instancePath + "/startedAtMs", schemaPath: "#/properties/startedAtMs/type", keyword: "type", params: { type: "integer" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.threadId !== void 0) {
              const _errs4 = errors;
              if (typeof data.threadId !== "string") {
                validate87.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.turnId !== void 0) {
                const _errs6 = errors;
                if (typeof data.turnId !== "string") {
                  validate87.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate87.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate87.errors = vErrors;
  return errors === 0;
}
function validate90(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.completedAtMs === void 0 && (missing0 = "completedAtMs") || data.item === void 0 && (missing0 = "item") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate90.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.completedAtMs !== void 0) {
          let data0 = data.completedAtMs;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            validate90.errors = [{ instancePath: instancePath + "/completedAtMs", schemaPath: "#/properties/completedAtMs/type", keyword: "type", params: { type: "integer" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.item !== void 0) {
            const _errs3 = errors;
            if (!validate42(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
              vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.threadId !== void 0) {
              const _errs4 = errors;
              if (typeof data.threadId !== "string") {
                validate90.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.turnId !== void 0) {
                const _errs6 = errors;
                if (typeof data.turnId !== "string") {
                  validate90.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate90.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate90.errors = vErrors;
  return errors === 0;
}
function validate93(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.tokenUsage === void 0 && (missing0 = "tokenUsage") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate93.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate93.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.tokenUsage !== void 0) {
            const _errs3 = errors;
            if (!validate63(data.tokenUsage, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
              vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.turnId !== void 0) {
              const _errs4 = errors;
              if (typeof data.turnId !== "string") {
                validate93.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate93.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate93.errors = vErrors;
  return errors === 0;
}
function validate80(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.notification === void 0 && (missing0 = "notification") || data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.notification !== void 0) {
          const _errs3 = errors;
          if (!validate81(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
            errors = vErrors.length;
          }
          var valid1 = _errs3 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.type !== void 0) {
            let data1 = data.type;
            const _errs4 = errors;
            if (typeof data1 !== "string") {
              const err1 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
            if (!(data1 === "turnStarted")) {
              const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema104.oneOf[0].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var valid1 = _errs4 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      const err3 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs6 = errors;
  if (errors === _errs6) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.notification === void 0 && (missing1 = "notification") || data.type === void 0 && (missing1 = "type")) {
        const err4 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.notification !== void 0) {
          const _errs8 = errors;
          if (!validate84(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
            errors = vErrors.length;
          }
          var valid2 = _errs8 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.type !== void 0) {
            let data3 = data.type;
            const _errs9 = errors;
            if (typeof data3 !== "string") {
              const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (!(data3 === "turnCompleted")) {
              const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema104.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            var valid2 = _errs9 === errors;
          } else {
            var valid2 = true;
          }
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid0 = _errs6 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs11 = errors;
    if (errors === _errs11) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.notification === void 0 && (missing2 = "notification") || data.type === void 0 && (missing2 = "type")) {
          const err8 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.notification !== void 0) {
            const _errs13 = errors;
            if (!validate87(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
              vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
              errors = vErrors.length;
            }
            var valid3 = _errs13 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data5 = data.type;
              const _errs14 = errors;
              if (typeof data5 !== "string") {
                const err9 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
              if (!(data5 === "itemStarted")) {
                const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema104.oneOf[2].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              var valid3 = _errs14 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    var _valid0 = _errs11 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs16 = errors;
      if (errors === _errs16) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.notification === void 0 && (missing3 = "notification") || data.type === void 0 && (missing3 = "type")) {
            const err12 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          } else {
            if (data.notification !== void 0) {
              const _errs18 = errors;
              if (!validate90(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
                errors = vErrors.length;
              }
              var valid4 = _errs18 === errors;
            } else {
              var valid4 = true;
            }
            if (valid4) {
              if (data.type !== void 0) {
                let data7 = data.type;
                const _errs19 = errors;
                if (typeof data7 !== "string") {
                  const err13 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (!(data7 === "itemCompleted")) {
                  const err14 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema104.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                var valid4 = _errs19 === errors;
              } else {
                var valid4 = true;
              }
            }
          }
        } else {
          const err15 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      var _valid0 = _errs16 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs21 = errors;
        if (errors === _errs21) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing4;
            if (data.notification === void 0 && (missing4 = "notification") || data.type === void 0 && (missing4 = "type")) {
              const err16 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing4 } };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            } else {
              if (data.notification !== void 0) {
                const _errs23 = errors;
                if (!validate93(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                  vErrors = vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
                  errors = vErrors.length;
                }
                var valid5 = _errs23 === errors;
              } else {
                var valid5 = true;
              }
              if (valid5) {
                if (data.type !== void 0) {
                  let data9 = data.type;
                  const _errs24 = errors;
                  if (typeof data9 !== "string") {
                    const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                  if (!(data9 === "tokenUsageUpdated")) {
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema104.oneOf[4].properties.type.enum } };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  var valid5 = _errs24 === errors;
                } else {
                  var valid5 = true;
                }
              }
            }
          } else {
            const err19 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        var _valid0 = _errs21 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
        }
      }
    }
  }
  if (!valid0) {
    const err20 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
    validate80.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate80.errors = vErrors;
  return errors === 0;
}
function validate79(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.commitId === void 0 && (missing0 = "commitId") || data.event === void 0 && (missing0 = "event") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate79.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.commitId !== void 0) {
          const _errs1 = errors;
          if (typeof data.commitId !== "string") {
            validate79.errors = [{ instancePath: instancePath + "/commitId", schemaPath: "#/properties/commitId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.event !== void 0) {
            const _errs3 = errors;
            if (!validate80(data.event, { instancePath: instancePath + "/event", parentData: data, parentDataProperty: "event", rootData })) {
              vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.parentCommitId !== void 0) {
              let data2 = data.parentCommitId;
              const _errs4 = errors;
              if (typeof data2 !== "string" && data2 !== null) {
                validate79.errors = [{ instancePath: instancePath + "/parentCommitId", schemaPath: "#/properties/parentCommitId/type", keyword: "type", params: { type: schema103.properties.parentCommitId.type } }];
                return false;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.subscriptionId !== void 0) {
                const _errs6 = errors;
                if (typeof data.subscriptionId !== "string") {
                  validate79.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.threadId !== void 0) {
                  const _errs8 = errors;
                  if (typeof data.threadId !== "string") {
                    validate79.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid0 = _errs8 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate79.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate79.errors = vErrors;
  return errors === 0;
}
function validate78(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate79(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
    errors = vErrors.length;
  }
  validate78.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadReadResponse = validate98;
function validate99(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate99.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.thread !== void 0) {
          if (!validate28(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
            errors = vErrors.length;
          }
        }
      }
    } else {
      validate99.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate99.errors = vErrors;
  return errors === 0;
}
function validate98(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate99(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
    errors = vErrors.length;
  }
  validate98.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadResumeResponse = validate102;
var schema113 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "$ref": "#/definitions/v2/AskForApproval" }, "approvalsReviewer": { "allOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }], "description": "Reviewer currently used for approval requests on this thread." }, "cwd": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "instructionSources": { "default": [], "description": "Environment-native paths to instruction source files currently loaded for this thread.", "items": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": "array" }, "model": { "type": "string" }, "modelProvider": { "type": "string" }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] }, "sandbox": { "allOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }], "description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance." }, "serviceTier": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" } }, "required": ["approvalPolicy", "approvalsReviewer", "cwd", "model", "modelProvider", "sandbox", "thread"], "title": "ThreadResumeResponse", "type": "object" };
var schema114 = { "oneOf": [{ "enum": ["untrusted", "on-request", "never"], "type": "string" }, { "additionalProperties": false, "properties": { "granular": { "properties": { "mcp_elicitations": { "type": "boolean" }, "request_permissions": { "default": false, "type": "boolean" }, "rules": { "type": "boolean" }, "sandbox_approval": { "type": "boolean" }, "skill_approval": { "default": false, "type": "boolean" } }, "required": ["mcp_elicitations", "rules", "sandbox_approval"], "type": "object" } }, "required": ["granular"], "title": "GranularAskForApproval", "type": "object" }] };
var schema115 = { "description": "Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.", "enum": ["user", "auto_review", "guardian_subagent"], "type": "string" };
var schema119 = { "oneOf": [{ "properties": { "type": { "enum": ["dangerFullAccess"], "title": "DangerFullAccessSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "DangerFullAccessSandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["readOnly"], "title": "ReadOnlySandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ReadOnlySandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "allOf": [{ "$ref": "#/definitions/v2/NetworkAccess" }], "default": "restricted" }, "type": { "enum": ["externalSandbox"], "title": "ExternalSandboxSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ExternalSandboxSandboxPolicy", "type": "object" }, { "properties": { "excludeSlashTmp": { "default": false, "type": "boolean" }, "excludeTmpdirEnvVar": { "default": false, "type": "boolean" }, "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["workspaceWrite"], "title": "WorkspaceWriteSandboxPolicyType", "type": "string" }, "writableRoots": { "default": [], "items": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "type": "array" } }, "required": ["type"], "title": "WorkspaceWriteSandboxPolicy", "type": "object" }] };
var schema120 = { "enum": ["restricted", "enabled"], "type": "string" };
function validate104(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type")) {
        const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: missing0 } };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err1 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          if (!(data0 === "dangerFullAccess")) {
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema119.oneOf[0].properties.type.enum } };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
      }
    } else {
      const err3 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (errors === _errs5) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.type === void 0 && (missing1 = "type")) {
        const err4 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      } else {
        if (data.networkAccess !== void 0) {
          const _errs7 = errors;
          if (typeof data.networkAccess !== "boolean") {
            const err5 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/oneOf/1/properties/networkAccess/type", keyword: "type", params: { type: "boolean" } };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          var valid2 = _errs7 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.type !== void 0) {
            let data2 = data.type;
            const _errs9 = errors;
            if (typeof data2 !== "string") {
              const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (!(data2 === "readOnly")) {
              const err7 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema119.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            var valid2 = _errs9 === errors;
          } else {
            var valid2 = true;
          }
        }
      }
    } else {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs11 = errors;
    if (errors === _errs11) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.type === void 0 && (missing2 = "type")) {
          const err9 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        } else {
          if (data.networkAccess !== void 0) {
            let data3 = data.networkAccess;
            const _errs13 = errors;
            if (typeof data3 !== "string") {
              const err10 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/definitions/v2/NetworkAccess/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (!(data3 === "restricted" || data3 === "enabled")) {
              const err11 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/definitions/v2/NetworkAccess/enum", keyword: "enum", params: { allowedValues: schema120.enum } };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            var valid3 = _errs13 === errors;
          } else {
            var valid3 = true;
          }
          if (valid3) {
            if (data.type !== void 0) {
              let data4 = data.type;
              const _errs17 = errors;
              if (typeof data4 !== "string") {
                const err12 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              if (!(data4 === "externalSandbox")) {
                const err13 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema119.oneOf[2].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              var valid3 = _errs17 === errors;
            } else {
              var valid3 = true;
            }
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    var _valid0 = _errs11 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs19 = errors;
      if (errors === _errs19) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.type === void 0 && (missing3 = "type")) {
            const err15 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          } else {
            if (data.excludeSlashTmp !== void 0) {
              const _errs21 = errors;
              if (typeof data.excludeSlashTmp !== "boolean") {
                const err16 = { instancePath: instancePath + "/excludeSlashTmp", schemaPath: "#/oneOf/3/properties/excludeSlashTmp/type", keyword: "type", params: { type: "boolean" } };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              var valid6 = _errs21 === errors;
            } else {
              var valid6 = true;
            }
            if (valid6) {
              if (data.excludeTmpdirEnvVar !== void 0) {
                const _errs23 = errors;
                if (typeof data.excludeTmpdirEnvVar !== "boolean") {
                  const err17 = { instancePath: instancePath + "/excludeTmpdirEnvVar", schemaPath: "#/oneOf/3/properties/excludeTmpdirEnvVar/type", keyword: "type", params: { type: "boolean" } };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                var valid6 = _errs23 === errors;
              } else {
                var valid6 = true;
              }
              if (valid6) {
                if (data.networkAccess !== void 0) {
                  const _errs25 = errors;
                  if (typeof data.networkAccess !== "boolean") {
                    const err18 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/oneOf/3/properties/networkAccess/type", keyword: "type", params: { type: "boolean" } };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                  var valid6 = _errs25 === errors;
                } else {
                  var valid6 = true;
                }
                if (valid6) {
                  if (data.type !== void 0) {
                    let data8 = data.type;
                    const _errs27 = errors;
                    if (typeof data8 !== "string") {
                      const err19 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                    if (!(data8 === "workspaceWrite")) {
                      const err20 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema119.oneOf[3].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err20];
                      } else {
                        vErrors.push(err20);
                      }
                      errors++;
                    }
                    var valid6 = _errs27 === errors;
                  } else {
                    var valid6 = true;
                  }
                  if (valid6) {
                    if (data.writableRoots !== void 0) {
                      let data9 = data.writableRoots;
                      const _errs29 = errors;
                      if (errors === _errs29) {
                        if (Array.isArray(data9)) {
                          var valid7 = true;
                          const len0 = data9.length;
                          for (let i0 = 0; i0 < len0; i0++) {
                            const _errs31 = errors;
                            if (typeof data9[i0] !== "string") {
                              const err21 = { instancePath: instancePath + "/writableRoots/" + i0, schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err21];
                              } else {
                                vErrors.push(err21);
                              }
                              errors++;
                            }
                            var valid7 = _errs31 === errors;
                            if (!valid7) {
                              break;
                            }
                          }
                        } else {
                          const err22 = { instancePath: instancePath + "/writableRoots", schemaPath: "#/oneOf/3/properties/writableRoots/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err22];
                          } else {
                            vErrors.push(err22);
                          }
                          errors++;
                        }
                      }
                      var valid6 = _errs29 === errors;
                    } else {
                      var valid6 = true;
                    }
                  }
                }
              }
            }
          }
        } else {
          const err23 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      var _valid0 = _errs19 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
      }
    }
  }
  if (!valid0) {
    const err24 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err24];
    } else {
      vErrors.push(err24);
    }
    errors++;
    validate104.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate104.errors = vErrors;
  return errors === 0;
}
function validate103(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.approvalPolicy === void 0 && (missing0 = "approvalPolicy") || data.approvalsReviewer === void 0 && (missing0 = "approvalsReviewer") || data.cwd === void 0 && (missing0 = "cwd") || data.model === void 0 && (missing0 = "model") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.sandbox === void 0 && (missing0 = "sandbox") || data.thread === void 0 && (missing0 = "thread")) {
        validate103.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          let data0 = data.approvalPolicy;
          const _errs1 = errors;
          const _errs3 = errors;
          let valid2 = false;
          let passing0 = null;
          const _errs4 = errors;
          if (typeof data0 !== "string") {
            const err0 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
          if (!(data0 === "untrusted" || data0 === "on-request" || data0 === "never")) {
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema114.oneOf[0].enum } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var _valid0 = _errs4 === errors;
          if (_valid0) {
            valid2 = true;
            passing0 = 0;
          }
          const _errs6 = errors;
          if (errors === _errs6) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing1;
              if (data0.granular === void 0 && (missing1 = "granular")) {
                const err2 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              } else {
                const _errs8 = errors;
                for (const key0 in data0) {
                  if (!(key0 === "granular")) {
                    const err3 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 } };
                    if (vErrors === null) {
                      vErrors = [err3];
                    } else {
                      vErrors.push(err3);
                    }
                    errors++;
                    break;
                  }
                }
                if (_errs8 === errors) {
                  if (data0.granular !== void 0) {
                    let data1 = data0.granular;
                    const _errs9 = errors;
                    if (errors === _errs9) {
                      if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                        let missing2;
                        if (data1.mcp_elicitations === void 0 && (missing2 = "mcp_elicitations") || data1.rules === void 0 && (missing2 = "rules") || data1.sandbox_approval === void 0 && (missing2 = "sandbox_approval")) {
                          const err4 = { instancePath: instancePath + "/approvalPolicy/granular", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/required", keyword: "required", params: { missingProperty: missing2 } };
                          if (vErrors === null) {
                            vErrors = [err4];
                          } else {
                            vErrors.push(err4);
                          }
                          errors++;
                        } else {
                          if (data1.mcp_elicitations !== void 0) {
                            const _errs11 = errors;
                            if (typeof data1.mcp_elicitations !== "boolean") {
                              const err5 = { instancePath: instancePath + "/approvalPolicy/granular/mcp_elicitations", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/mcp_elicitations/type", keyword: "type", params: { type: "boolean" } };
                              if (vErrors === null) {
                                vErrors = [err5];
                              } else {
                                vErrors.push(err5);
                              }
                              errors++;
                            }
                            var valid4 = _errs11 === errors;
                          } else {
                            var valid4 = true;
                          }
                          if (valid4) {
                            if (data1.request_permissions !== void 0) {
                              const _errs13 = errors;
                              if (typeof data1.request_permissions !== "boolean") {
                                const err6 = { instancePath: instancePath + "/approvalPolicy/granular/request_permissions", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/request_permissions/type", keyword: "type", params: { type: "boolean" } };
                                if (vErrors === null) {
                                  vErrors = [err6];
                                } else {
                                  vErrors.push(err6);
                                }
                                errors++;
                              }
                              var valid4 = _errs13 === errors;
                            } else {
                              var valid4 = true;
                            }
                            if (valid4) {
                              if (data1.rules !== void 0) {
                                const _errs15 = errors;
                                if (typeof data1.rules !== "boolean") {
                                  const err7 = { instancePath: instancePath + "/approvalPolicy/granular/rules", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/rules/type", keyword: "type", params: { type: "boolean" } };
                                  if (vErrors === null) {
                                    vErrors = [err7];
                                  } else {
                                    vErrors.push(err7);
                                  }
                                  errors++;
                                }
                                var valid4 = _errs15 === errors;
                              } else {
                                var valid4 = true;
                              }
                              if (valid4) {
                                if (data1.sandbox_approval !== void 0) {
                                  const _errs17 = errors;
                                  if (typeof data1.sandbox_approval !== "boolean") {
                                    const err8 = { instancePath: instancePath + "/approvalPolicy/granular/sandbox_approval", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/sandbox_approval/type", keyword: "type", params: { type: "boolean" } };
                                    if (vErrors === null) {
                                      vErrors = [err8];
                                    } else {
                                      vErrors.push(err8);
                                    }
                                    errors++;
                                  }
                                  var valid4 = _errs17 === errors;
                                } else {
                                  var valid4 = true;
                                }
                                if (valid4) {
                                  if (data1.skill_approval !== void 0) {
                                    const _errs19 = errors;
                                    if (typeof data1.skill_approval !== "boolean") {
                                      const err9 = { instancePath: instancePath + "/approvalPolicy/granular/skill_approval", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/skill_approval/type", keyword: "type", params: { type: "boolean" } };
                                      if (vErrors === null) {
                                        vErrors = [err9];
                                      } else {
                                        vErrors.push(err9);
                                      }
                                      errors++;
                                    }
                                    var valid4 = _errs19 === errors;
                                  } else {
                                    var valid4 = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      } else {
                        const err10 = { instancePath: instancePath + "/approvalPolicy/granular", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err10];
                        } else {
                          vErrors.push(err10);
                        }
                        errors++;
                      }
                    }
                  }
                }
              }
            } else {
              const err11 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          var _valid0 = _errs6 === errors;
          if (_valid0 && valid2) {
            valid2 = false;
            passing0 = [passing0, 1];
          } else {
            if (_valid0) {
              valid2 = true;
              passing0 = 1;
            }
          }
          if (!valid2) {
            const err12 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
            validate103.errors = vErrors;
            return false;
          } else {
            errors = _errs3;
            if (vErrors !== null) {
              if (_errs3) {
                vErrors.length = _errs3;
              } else {
                vErrors = null;
              }
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.approvalsReviewer !== void 0) {
            let data7 = data.approvalsReviewer;
            const _errs21 = errors;
            if (typeof data7 !== "string") {
              validate103.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              validate103.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema115.enum } }];
              return false;
            }
            var valid0 = _errs21 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.cwd !== void 0) {
              const _errs25 = errors;
              if (typeof data.cwd !== "string") {
                validate103.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs25 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.instructionSources !== void 0) {
                let data9 = data.instructionSources;
                const _errs28 = errors;
                if (errors === _errs28) {
                  if (Array.isArray(data9)) {
                    var valid8 = true;
                    const len0 = data9.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      const _errs30 = errors;
                      if (typeof data9[i0] !== "string") {
                        validate103.errors = [{ instancePath: instancePath + "/instructionSources/" + i0, schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid8 = _errs30 === errors;
                      if (!valid8) {
                        break;
                      }
                    }
                  } else {
                    validate103.errors = [{ instancePath: instancePath + "/instructionSources", schemaPath: "#/properties/instructionSources/type", keyword: "type", params: { type: "array" } }];
                    return false;
                  }
                }
                var valid0 = _errs28 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.model !== void 0) {
                  const _errs33 = errors;
                  if (typeof data.model !== "string") {
                    validate103.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid0 = _errs33 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.modelProvider !== void 0) {
                    const _errs35 = errors;
                    if (typeof data.modelProvider !== "string") {
                      validate103.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid0 = _errs35 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.reasoningEffort !== void 0) {
                      let data13 = data.reasoningEffort;
                      const _errs37 = errors;
                      const _errs38 = errors;
                      let valid10 = false;
                      const _errs39 = errors;
                      const _errs40 = errors;
                      if (errors === _errs40) {
                        if (typeof data13 === "string") {
                          if (func2(data13) < 1) {
                            const err13 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                            if (vErrors === null) {
                              vErrors = [err13];
                            } else {
                              vErrors.push(err13);
                            }
                            errors++;
                          }
                        } else {
                          const err14 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err14];
                          } else {
                            vErrors.push(err14);
                          }
                          errors++;
                        }
                      }
                      var _valid1 = _errs39 === errors;
                      valid10 = valid10 || _valid1;
                      if (!valid10) {
                        const _errs42 = errors;
                        if (data13 !== null) {
                          const err15 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                          if (vErrors === null) {
                            vErrors = [err15];
                          } else {
                            vErrors.push(err15);
                          }
                          errors++;
                        }
                        var _valid1 = _errs42 === errors;
                        valid10 = valid10 || _valid1;
                      }
                      if (!valid10) {
                        const err16 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                        if (vErrors === null) {
                          vErrors = [err16];
                        } else {
                          vErrors.push(err16);
                        }
                        errors++;
                        validate103.errors = vErrors;
                        return false;
                      } else {
                        errors = _errs38;
                        if (vErrors !== null) {
                          if (_errs38) {
                            vErrors.length = _errs38;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                      var valid0 = _errs37 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.sandbox !== void 0) {
                        const _errs44 = errors;
                        if (!validate104(data.sandbox, { instancePath: instancePath + "/sandbox", parentData: data, parentDataProperty: "sandbox", rootData })) {
                          vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
                          errors = vErrors.length;
                        }
                        var valid0 = _errs44 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.serviceTier !== void 0) {
                          let data15 = data.serviceTier;
                          const _errs46 = errors;
                          if (typeof data15 !== "string" && data15 !== null) {
                            validate103.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema113.properties.serviceTier.type } }];
                            return false;
                          }
                          var valid0 = _errs46 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.thread !== void 0) {
                            const _errs48 = errors;
                            if (!validate28(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
                              errors = vErrors.length;
                            }
                            var valid0 = _errs48 === errors;
                          } else {
                            var valid0 = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate103.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate103.errors = vErrors;
  return errors === 0;
}
function validate102(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate103(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate103.errors : vErrors.concat(validate103.errors);
    errors = vErrors.length;
  }
  validate102.errors = vErrors;
  return errors === 0;
}
var validateV2TurnInterruptResponse = validate108;
function validate108(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    validate108.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptResponse/type", keyword: "type", params: { type: "object" } }];
    return false;
  }
  validate108.errors = vErrors;
  return errors === 0;
}
var validateV2TurnStartResponse = validate109;
function validate110(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turn === void 0 && (missing0 = "turn")) {
        validate110.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.turn !== void 0) {
          if (!validate37(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
            vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
            errors = vErrors.length;
          }
        }
      }
    } else {
      validate110.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate110.errors = vErrors;
  return errors === 0;
}
function validate109(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate110(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
    errors = vErrors.length;
  }
  validate109.errors = vErrors;
  return errors === 0;
}
var validateV2TurnSteerResponse = validate113;
function validate113(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  if (errors === _errs0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turnId === void 0 && (missing0 = "turnId")) {
        validate113.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.turnId !== void 0) {
          if (typeof data.turnId !== "string") {
            validate113.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/properties/turnId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
        }
      }
    } else {
      validate113.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate113.errors = vErrors;
  return errors === 0;
}
export {
  validateInitializeResponse,
  validateV2SkillsChangedNotification,
  validateV2SkillsListResponse,
  validateV2ThreadListResponse,
  validateV2ThreadProjectionAttachResponse,
  validateV2ThreadProjectionClosedNotification,
  validateV2ThreadProjectionDeltaNotification,
  validateV2ThreadProjectionDetachResponse,
  validateV2ThreadProjectionEventNotification,
  validateV2ThreadReadResponse,
  validateV2ThreadResumeResponse,
  validateV2TurnInterruptResponse,
  validateV2TurnStartResponse,
  validateV2TurnSteerResponse
};
