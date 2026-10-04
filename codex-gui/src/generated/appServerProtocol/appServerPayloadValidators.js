// GENERATED CODE! DO NOT MODIFY BY HAND!
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
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
var schema21 = { "properties": { "dependencies": { "anyOf": [{ "$ref": "#/definitions/v2/SkillDependencies" }, { "type": "null" }] }, "description": { "type": "string" }, "enabled": { "type": "boolean" }, "interface": { "anyOf": [{ "$ref": "#/definitions/v2/SkillInterface" }, { "type": "null" }] }, "name": { "type": "string" }, "path": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "pluginId": { "description": "Owning plugin ID, matching `PluginSummary.id`, when known.", "type": ["string", "null"] }, "scope": { "$ref": "#/definitions/v2/SkillScope" }, "shortDescription": { "description": "Legacy short_description from SKILL.md. Prefer SKILL.json interface.short_description.", "type": ["string", "null"] } }, "required": ["description", "enabled", "name", "path", "scope"], "type": "object" };
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
                    if (data.pluginId !== void 0) {
                      let data6 = data.pluginId;
                      const _errs20 = errors;
                      if (typeof data6 !== "string" && data6 !== null) {
                        validate18.errors = [{ instancePath: instancePath + "/pluginId", schemaPath: "#/properties/pluginId/type", keyword: "type", params: { type: schema21.properties.pluginId.type } }];
                        return false;
                      }
                      var valid0 = _errs20 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.scope !== void 0) {
                        let data7 = data.scope;
                        const _errs22 = errors;
                        if (typeof data7 !== "string") {
                          validate18.errors = [{ instancePath: instancePath + "/scope", schemaPath: "#/definitions/v2/SkillScope/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        if (!(data7 === "user" || data7 === "repo" || data7 === "system" || data7 === "admin")) {
                          validate18.errors = [{ instancePath: instancePath + "/scope", schemaPath: "#/definitions/v2/SkillScope/enum", keyword: "enum", params: { allowedValues: schema28.enum } }];
                          return false;
                        }
                        var valid0 = _errs22 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.shortDescription !== void 0) {
                          let data8 = data.shortDescription;
                          const _errs25 = errors;
                          if (typeof data8 !== "string" && data8 !== null) {
                            validate18.errors = [{ instancePath: instancePath + "/shortDescription", schemaPath: "#/properties/shortDescription/type", keyword: "type", params: { type: schema21.properties.shortDescription.type } }];
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
var validateV2ThreadCompactStartResponse = validate26;
function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    validate26.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadCompactStartResponse/type", keyword: "type", params: { type: "object" } }];
    return false;
  }
  validate26.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadForkResponse = validate27;
var schema32 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "$ref": "#/definitions/v2/AskForApproval" }, "approvalsReviewer": { "allOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }], "description": "Reviewer currently used for approval requests on this thread." }, "cwd": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "disabledPluginIds": { "default": [], "description": "Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.", "items": { "type": "string" }, "type": "array" }, "instructionSources": { "default": [], "description": "Environment-native paths to instruction source files currently loaded for this thread.", "items": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": "array" }, "model": { "type": "string" }, "modelProvider": { "type": "string" }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] }, "sandbox": { "allOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }], "description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance." }, "serviceTier": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" } }, "required": ["approvalPolicy", "approvalsReviewer", "cwd", "model", "modelProvider", "reasoningEffort", "sandbox", "serviceTier", "thread"], "title": "ThreadForkResponse", "type": "object" };
var schema33 = { "oneOf": [{ "enum": ["untrusted", "on-request", "never"], "type": "string" }, { "additionalProperties": false, "properties": { "granular": { "properties": { "mcp_elicitations": { "type": "boolean" }, "request_permissions": { "default": false, "type": "boolean" }, "rules": { "type": "boolean" }, "sandbox_approval": { "type": "boolean" }, "skill_approval": { "default": false, "type": "boolean" } }, "required": ["mcp_elicitations", "rules", "sandbox_approval"], "type": "object" } }, "required": ["granular"], "title": "GranularAskForApproval", "type": "object" }] };
var schema34 = { "description": "Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.", "enum": ["user", "auto_review", "guardian_subagent"], "type": "string" };
var func2 = require_ucs2length().default;
var schema38 = { "oneOf": [{ "properties": { "type": { "enum": ["dangerFullAccess"], "title": "DangerFullAccessSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "DangerFullAccessSandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["readOnly"], "title": "ReadOnlySandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ReadOnlySandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "allOf": [{ "$ref": "#/definitions/v2/NetworkAccess" }], "default": "restricted" }, "type": { "enum": ["externalSandbox"], "title": "ExternalSandboxSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ExternalSandboxSandboxPolicy", "type": "object" }, { "properties": { "excludeSlashTmp": { "default": false, "type": "boolean" }, "excludeTmpdirEnvVar": { "default": false, "type": "boolean" }, "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["workspaceWrite"], "title": "WorkspaceWriteSandboxPolicyType", "type": "string" }, "writableRoots": { "default": [], "items": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "type": "array" } }, "required": ["type"], "title": "WorkspaceWriteSandboxPolicy", "type": "object" }] };
var schema39 = { "enum": ["restricted", "enabled"], "type": "string" };
function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema38.oneOf[0].properties.type.enum } };
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
              const err7 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema38.oneOf[1].properties.type.enum } };
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
              const err11 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/definitions/v2/NetworkAccess/enum", keyword: "enum", params: { allowedValues: schema39.enum } };
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
                const err13 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema38.oneOf[2].properties.type.enum } };
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
                      const err20 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema38.oneOf[3].properties.type.enum } };
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
    validate29.errors = vErrors;
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
  validate29.errors = vErrors;
  return errors === 0;
}
var schema41 = { "properties": { "agentNickname": { "description": "Optional random unique nickname assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "agentRole": { "description": "Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "cliVersion": { "description": "Version of the CLI that created the thread.", "type": "string" }, "createdAt": { "description": "Unix timestamp (in seconds) when the thread was created.", "format": "int64", "type": "integer" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }], "description": "Working directory captured for the thread." }, "ephemeral": { "description": "Whether the thread is ephemeral and should not be materialized on disk.", "type": "boolean" }, "forkedFromId": { "description": "Source thread id when this thread was created by forking another thread.", "type": ["string", "null"] }, "gitInfo": { "anyOf": [{ "$ref": "#/definitions/v2/GitInfo" }, { "type": "null" }], "description": "Optional Git metadata captured when the thread was created." }, "historyMode": { "allOf": [{ "$ref": "#/definitions/v2/ThreadHistoryMode" }], "default": "legacy", "description": "Persisted thread history contract selected when this thread was created." }, "id": { "description": "Identifier for this thread. Codex-generated thread IDs are UUIDv7.", "type": "string" }, "model": { "description": "Current configured model when loaded, otherwise the latest persisted model. Null when unavailable. This is not per-turn execution telemetry.", "type": ["string", "null"] }, "modelProvider": { "description": "Model provider used for this thread (for example, 'openai').", "type": "string" }, "name": { "description": "Optional user-facing thread title.", "type": ["string", "null"] }, "originator": { "description": "Originator recorded when the thread was created, independent of its current client or executor. Null when the recorded originator is unavailable.", "type": ["string", "null"] }, "parentThreadId": { "description": "The ID of the parent thread. This will only be set if this thread is a subagent.", "type": ["string", "null"] }, "path": { "description": "[UNSTABLE] Path to the thread on disk.", "type": ["string", "null"] }, "preview": { "description": "Usually the first user message in the thread, if available.", "type": "string" }, "projectId": { "description": "Canonical project assignment owned by app-server, if any.", "type": ["string", "null"] }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }], "description": "Current configured reasoning effort when loaded, otherwise the latest persisted effort. Null when unset or unavailable. This is not per-turn execution telemetry." }, "recencyAt": { "description": "Unix timestamp (in seconds) used for thread recency ordering.", "format": "int64", "type": ["integer", "null"] }, "section": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSection" }, { "type": "null" }], "default": null, "description": "The independently persisted section selected for this thread, if any." }, "sectionEnteredAt": { "default": null, "description": "Unix timestamp in seconds when the thread entered its current section.", "format": "int64", "type": ["integer", "null"] }, "sessionId": { "description": "Session id shared by threads that belong to the same session tree.", "type": "string" }, "source": { "allOf": [{ "$ref": "#/definitions/v2/SessionSource" }], "description": "Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.)." }, "status": { "allOf": [{ "$ref": "#/definitions/v2/ThreadStatus" }], "description": "Current runtime status for the thread." }, "threadSource": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSource" }, { "type": "null" }], "description": "Optional analytics source classification for this thread." }, "turns": { "description": "Only populated on `thread/resume`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.", "items": { "$ref": "#/definitions/v2/Turn" }, "type": "array" }, "updatedAt": { "description": "Unix timestamp (in seconds) when the thread was last updated.", "format": "int64", "type": "integer" } }, "required": ["cliVersion", "createdAt", "cwd", "ephemeral", "id", "modelProvider", "preview", "projectId", "sessionId", "source", "status", "turns", "updatedAt"], "type": "object" };
var schema43 = { "properties": { "branch": { "type": ["string", "null"] }, "originUrl": { "type": ["string", "null"] }, "sha": { "type": ["string", "null"] } }, "type": "object" };
var schema44 = { "enum": ["legacy", "paginated"], "type": "string" };
var schema47 = { "description": "Extensible visual presentation for a custom thread section.", "properties": { "color": { "type": ["string", "null"] }, "icon": { "type": ["string", "null"] } }, "type": "object" };
function validate32(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.name === void 0 && (missing0 = "name")) {
        validate32.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                  const err0 = { instancePath: instancePath + "/appearance/color", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/color/type", keyword: "type", params: { type: schema47.properties.color.type } };
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
                    const err1 = { instancePath: instancePath + "/appearance/icon", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/icon/type", keyword: "type", params: { type: schema47.properties.icon.type } };
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
            validate32.errors = vErrors;
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
              validate32.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
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
                validate32.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" } }];
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
      validate32.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate32.errors = vErrors;
  return errors === 0;
}
var schema48 = { "oneOf": [{ "enum": ["cli", "vscode", "exec", "appServer", "unknown"], "type": "string" }, { "additionalProperties": false, "properties": { "custom": { "type": "string" } }, "required": ["custom"], "title": "CustomSessionSource", "type": "object" }, { "additionalProperties": false, "properties": { "subAgent": { "$ref": "#/definitions/v2/SubAgentSource" } }, "required": ["subAgent"], "title": "SubAgentSessionSource", "type": "object" }] };
var schema49 = { "oneOf": [{ "enum": ["review", "compact", "memory_consolidation"], "type": "string" }, { "additionalProperties": false, "properties": { "thread_spawn": { "properties": { "agent_nickname": { "default": null, "type": ["string", "null"] }, "agent_path": { "anyOf": [{ "$ref": "#/definitions/v2/AgentPath" }, { "type": "null" }], "default": null }, "agent_role": { "default": null, "type": ["string", "null"] }, "depth": { "format": "int32", "type": "integer" }, "parent_thread_id": { "$ref": "#/definitions/v2/ThreadId" } }, "required": ["depth", "parent_thread_id"], "type": "object" } }, "required": ["thread_spawn"], "title": "ThreadSpawnSubAgentSource", "type": "object" }, { "additionalProperties": false, "properties": { "other": { "type": "string" } }, "required": ["other"], "title": "OtherSubAgentSource", "type": "object" }] };
function validate35(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema49.oneOf[0].enum } };
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
                      const err5 = { instancePath: instancePath + "/thread_spawn/agent_nickname", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_nickname/type", keyword: "type", params: { type: schema49.oneOf[1].properties.thread_spawn.properties.agent_nickname.type } };
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
                          const err9 = { instancePath: instancePath + "/thread_spawn/agent_role", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_role/type", keyword: "type", params: { type: schema49.oneOf[1].properties.thread_spawn.properties.agent_role.type } };
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
function validate34(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema48.oneOf[0].enum } };
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
              if (!validate35(data.subAgent, { instancePath: instancePath + "/subAgent", parentData: data, parentDataProperty: "subAgent", rootData })) {
                vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
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
    validate34.errors = vErrors;
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
  validate34.errors = vErrors;
  return errors === 0;
}
var schema52 = { "oneOf": [{ "properties": { "type": { "enum": ["notLoaded"], "title": "NotLoadedThreadStatusType", "type": "string" } }, "required": ["type"], "title": "NotLoadedThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["idle"], "title": "IdleThreadStatusType", "type": "string" } }, "required": ["type"], "title": "IdleThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["systemError"], "title": "SystemErrorThreadStatusType", "type": "string" } }, "required": ["type"], "title": "SystemErrorThreadStatus", "type": "object" }, { "properties": { "activeFlags": { "items": { "$ref": "#/definitions/v2/ThreadActiveFlag" }, "type": "array" }, "type": { "enum": ["active"], "title": "ActiveThreadStatusType", "type": "string" } }, "required": ["activeFlags", "type"], "title": "ActiveThreadStatus", "type": "object" }] };
var schema53 = { "enum": ["waitingOnApproval", "waitingOnUserInput"], "type": "string" };
function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema52.oneOf[0].properties.type.enum } };
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
            const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema52.oneOf[1].properties.type.enum } };
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
              const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema52.oneOf[2].properties.type.enum } };
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
                      const err14 = { instancePath: instancePath + "/activeFlags/" + i0, schemaPath: "#/definitions/v2/ThreadActiveFlag/enum", keyword: "enum", params: { allowedValues: schema53.enum } };
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
                  const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema52.oneOf[3].properties.type.enum } };
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
    validate38.errors = vErrors;
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
  validate38.errors = vErrors;
  return errors === 0;
}
var schema55 = { "properties": { "completedAt": { "description": "Unix timestamp (in seconds) when the turn completed.", "format": "int64", "type": ["integer", "null"] }, "durationMs": { "description": "Duration between turn start and completion in milliseconds, if known.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/TurnError" }, { "type": "null" }], "description": "Error associated with a failed or interrupted turn." }, "id": { "description": "Identifier for this turn. Codex-generated turn IDs are UUIDv7.", "type": "string" }, "items": { "description": "Thread items currently included in this turn payload.", "items": { "$ref": "#/definitions/v2/ThreadItem" }, "type": "array" }, "itemsView": { "allOf": [{ "$ref": "#/definitions/v2/TurnItemsView" }], "default": "full", "description": "Describes how much of `items` has been loaded for this turn." }, "startedAt": { "description": "Unix timestamp (in seconds) when the turn started.", "format": "int64", "type": ["integer", "null"] }, "status": { "$ref": "#/definitions/v2/TurnStatus" } }, "required": ["id", "items", "status"], "type": "object" };
var schema102 = { "oneOf": [{ "description": "`items` was not loaded for this turn. The field is intentionally empty.", "enum": ["notLoaded"], "type": "string" }, { "description": "`items` contains only a display summary for this turn.", "enum": ["summary"], "type": "string" }, { "description": "`items` contains every ThreadItem available from persisted app-server history for this turn.", "enum": ["full"], "type": "string" }] };
var schema103 = { "enum": ["completed", "interrupted", "failed", "inProgress"], "type": "string" };
var schema56 = { "properties": { "additionalDetails": { "default": null, "type": ["string", "null"] }, "codexErrorInfo": { "anyOf": [{ "$ref": "#/definitions/v2/CodexErrorInfo" }, { "type": "null" }] }, "message": { "type": "string" }, "misalignment": { "anyOf": [{ "$ref": "#/definitions/v2/MisalignmentErrorDetails" }, { "type": "null" }], "default": null, "description": "Optional public explanation and continuation instruction for a misalignment block." } }, "required": ["message"], "type": "object" };
var schema57 = { "description": "This translation layer make sure that we expose codex error code in camel case.\n\nWhen an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.", "oneOf": [{ "enum": ["contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "rateLimitExceeded", "flexUnavailable", "serverOverloaded", "cyberPolicy", "misalignmentPolicyViolation", "tooManyDenials", "internalServerError", "unauthorized", "badRequest", "threadRollbackFailed", "sandboxError", "other"], "type": "string" }, { "additionalProperties": false, "properties": { "httpConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["httpConnectionFailed"], "title": "HttpConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Failed to connect to the response SSE stream.", "properties": { "responseStreamConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamConnectionFailed"], "title": "ResponseStreamConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "The response SSE stream disconnected in the middle of a turn before completion.", "properties": { "responseStreamDisconnected": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamDisconnected"], "title": "ResponseStreamDisconnectedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Reached the retry limit for responses.", "properties": { "responseTooManyFailedAttempts": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseTooManyFailedAttempts"], "title": "ResponseTooManyFailedAttemptsCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.", "properties": { "activeTurnNotSteerable": { "properties": { "turnKind": { "$ref": "#/definitions/v2/NonSteerableTurnKind" } }, "required": ["turnKind"], "type": "object" } }, "required": ["activeTurnNotSteerable"], "title": "ActiveTurnNotSteerableCodexErrorInfo", "type": "object" }] };
var schema58 = { "enum": ["review", "compact"], "type": "string" };
function validate42(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
  if (!(data === "contextWindowExceeded" || data === "sessionBudgetExceeded" || data === "usageLimitExceeded" || data === "rateLimitExceeded" || data === "flexUnavailable" || data === "serverOverloaded" || data === "cyberPolicy" || data === "misalignmentPolicyViolation" || data === "tooManyDenials" || data === "internalServerError" || data === "unauthorized" || data === "badRequest" || data === "threadRollbackFailed" || data === "sandboxError" || data === "other")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema57.oneOf[0].enum } };
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
                    const err4 = { instancePath: instancePath + "/httpConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/1/properties/httpConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema57.oneOf[1].properties.httpConnectionFailed.properties.httpStatusCode.type } };
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
                      const err10 = { instancePath: instancePath + "/responseStreamConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema57.oneOf[2].properties.responseStreamConnectionFailed.properties.httpStatusCode.type } };
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
                        const err16 = { instancePath: instancePath + "/responseStreamDisconnected/httpStatusCode", schemaPath: "#/oneOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/type", keyword: "type", params: { type: schema57.oneOf[3].properties.responseStreamDisconnected.properties.httpStatusCode.type } };
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
                          const err22 = { instancePath: instancePath + "/responseTooManyFailedAttempts/httpStatusCode", schemaPath: "#/oneOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/type", keyword: "type", params: { type: schema57.oneOf[4].properties.responseTooManyFailedAttempts.properties.httpStatusCode.type } };
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
                              const err30 = { instancePath: instancePath + "/activeTurnNotSteerable/turnKind", schemaPath: "#/definitions/v2/NonSteerableTurnKind/enum", keyword: "enum", params: { allowedValues: schema58.enum } };
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
var schema59 = { "properties": { "detailedExplanation": { "description": "A substantive localized explanation is required before offering continuation.", "type": ["string", "null"] }, "errorType": { "description": "Open-ended classification; clients must accept categories added by Responses.", "type": ["string", "null"] }, "steer": { "anyOf": [{ "$ref": "#/definitions/v2/MisalignmentSteer" }, { "type": "null" }], "description": "Instruction to submit as the next turn's user input if continuation is confirmed." } }, "type": "object" };
function validate44(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.detailedExplanation !== void 0) {
        let data0 = data.detailedExplanation;
        const _errs1 = errors;
        if (typeof data0 !== "string" && data0 !== null) {
          validate44.errors = [{ instancePath: instancePath + "/detailedExplanation", schemaPath: "#/properties/detailedExplanation/type", keyword: "type", params: { type: schema59.properties.detailedExplanation.type } }];
          return false;
        }
        var valid0 = _errs1 === errors;
      } else {
        var valid0 = true;
      }
      if (valid0) {
        if (data.errorType !== void 0) {
          let data1 = data.errorType;
          const _errs3 = errors;
          if (typeof data1 !== "string" && data1 !== null) {
            validate44.errors = [{ instancePath: instancePath + "/errorType", schemaPath: "#/properties/errorType/type", keyword: "type", params: { type: schema59.properties.errorType.type } }];
            return false;
          }
          var valid0 = _errs3 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.steer !== void 0) {
            let data2 = data.steer;
            const _errs5 = errors;
            const _errs6 = errors;
            let valid1 = false;
            const _errs7 = errors;
            const _errs8 = errors;
            if (errors === _errs8) {
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                let missing0;
                if (data2.message === void 0 && (missing0 = "message")) {
                  const err0 = { instancePath: instancePath + "/steer", schemaPath: "#/definitions/v2/MisalignmentSteer/required", keyword: "required", params: { missingProperty: missing0 } };
                  if (vErrors === null) {
                    vErrors = [err0];
                  } else {
                    vErrors.push(err0);
                  }
                  errors++;
                } else {
                  if (data2.message !== void 0) {
                    if (typeof data2.message !== "string") {
                      const err1 = { instancePath: instancePath + "/steer/message", schemaPath: "#/definitions/v2/MisalignmentSteer/properties/message/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err1];
                      } else {
                        vErrors.push(err1);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err2 = { instancePath: instancePath + "/steer", schemaPath: "#/definitions/v2/MisalignmentSteer/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
            var _valid0 = _errs7 === errors;
            valid1 = valid1 || _valid0;
            if (!valid1) {
              const _errs12 = errors;
              if (data2 !== null) {
                const err3 = { instancePath: instancePath + "/steer", schemaPath: "#/properties/steer/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
              var _valid0 = _errs12 === errors;
              valid1 = valid1 || _valid0;
            }
            if (!valid1) {
              const err4 = { instancePath: instancePath + "/steer", schemaPath: "#/properties/steer/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
              validate44.errors = vErrors;
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
function validate41(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = "message")) {
        validate41.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.additionalDetails !== void 0) {
          let data0 = data.additionalDetails;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate41.errors = [{ instancePath: instancePath + "/additionalDetails", schemaPath: "#/properties/additionalDetails/type", keyword: "type", params: { type: schema56.properties.additionalDetails.type } }];
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
            if (!validate42(data1, { instancePath: instancePath + "/codexErrorInfo", parentData: data, parentDataProperty: "codexErrorInfo", rootData })) {
              vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
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
              validate41.errors = vErrors;
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
                validate41.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.misalignment !== void 0) {
                let data3 = data.misalignment;
                const _errs10 = errors;
                const _errs11 = errors;
                let valid2 = false;
                const _errs12 = errors;
                if (!validate44(data3, { instancePath: instancePath + "/misalignment", parentData: data, parentDataProperty: "misalignment", rootData })) {
                  vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
                  errors = vErrors.length;
                }
                var _valid1 = _errs12 === errors;
                valid2 = valid2 || _valid1;
                if (!valid2) {
                  const _errs13 = errors;
                  if (data3 !== null) {
                    const err2 = { instancePath: instancePath + "/misalignment", schemaPath: "#/properties/misalignment/anyOf/1/type", keyword: "type", params: { type: "null" } };
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
                  const err3 = { instancePath: instancePath + "/misalignment", schemaPath: "#/properties/misalignment/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                  validate41.errors = vErrors;
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
            }
          }
        }
      }
    } else {
      validate41.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate41.errors = vErrors;
  return errors === 0;
}
var schema61 = { "oneOf": [{ "properties": { "clientId": { "type": ["string", "null"] }, "content": { "items": { "$ref": "#/definitions/v2/UserInput" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["userMessage"], "title": "UserMessageThreadItemType", "type": "string" } }, "required": ["content", "id", "type"], "title": "UserMessageThreadItem", "type": "object" }, { "properties": { "fragments": { "items": { "$ref": "#/definitions/v2/HookPromptFragment" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["hookPrompt"], "title": "HookPromptThreadItemType", "type": "string" } }, "required": ["fragments", "id", "type"], "title": "HookPromptThreadItem", "type": "object" }, { "properties": { "delivery": { "anyOf": [{ "$ref": "#/definitions/v2/AgentMessageDelivery" }, { "type": "null" }], "default": null }, "id": { "type": "string" }, "memoryCitation": { "anyOf": [{ "$ref": "#/definitions/v2/MemoryCitation" }, { "type": "null" }], "default": null }, "phase": { "anyOf": [{ "$ref": "#/definitions/v2/MessagePhase" }, { "type": "null" }], "default": null }, "questions": { "default": null, "items": { "$ref": "#/definitions/v2/AsyncUserInputQuestion" }, "type": ["array", "null"] }, "text": { "type": "string" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "AgentMessageThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "output": { "$ref": "#/definitions/v2/FunctionCallOutputBody" }, "type": { "enum": ["functionCallOutput"], "title": "FunctionCallOutputThreadItemType", "type": "string" } }, "required": ["id", "name", "output", "type"], "title": "FunctionCallOutputThreadItem", "type": "object" }, { "description": "EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.", "properties": { "id": { "type": "string" }, "text": { "type": "string" }, "type": { "enum": ["plan"], "title": "PlanThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "PlanThreadItem", "type": "object" }, { "properties": { "content": { "default": [], "items": { "type": "string" }, "type": "array" }, "id": { "type": "string" }, "summary": { "default": [], "items": { "type": "string" }, "type": "array" }, "type": { "enum": ["reasoning"], "title": "ReasoningThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ReasoningThreadItem", "type": "object" }, { "properties": { "aggregatedOutput": { "description": "The command's output, aggregated from stdout and stderr.", "type": ["string", "null"] }, "command": { "description": "The command to be executed.", "type": "string" }, "commandActions": { "description": "A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.", "items": { "$ref": "#/definitions/v2/CommandAction" }, "type": "array" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/LegacyAppPathString" }], "description": "The command's working directory." }, "durationMs": { "description": "The duration of the command execution in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "exitCode": { "description": "The command's exit code.", "format": "int32", "type": ["integer", "null"] }, "id": { "type": "string" }, "pluginId": { "default": null, "description": "Trusted first-party plugin id when this command resolves to one plugin script.", "type": ["string", "null"] }, "processId": { "description": "Identifier for the underlying PTY process (when available).", "type": ["string", "null"] }, "scriptPath": { "default": null, "description": "Safe plugin-relative path when this command resolves to one plugin script.", "type": ["string", "null"] }, "source": { "allOf": [{ "$ref": "#/definitions/v2/CommandExecutionSource" }], "default": "agent" }, "status": { "$ref": "#/definitions/v2/CommandExecutionStatus" }, "type": { "enum": ["commandExecution"], "title": "CommandExecutionThreadItemType", "type": "string" } }, "required": ["command", "commandActions", "cwd", "id", "status", "type"], "title": "CommandExecutionThreadItem", "type": "object" }, { "properties": { "changes": { "items": { "$ref": "#/definitions/v2/FileUpdateChange" }, "type": "array" }, "id": { "type": "string" }, "status": { "$ref": "#/definitions/v2/PatchApplyStatus" }, "type": { "enum": ["fileChange"], "title": "FileChangeThreadItemType", "type": "string" } }, "required": ["changes", "id", "status", "type"], "title": "FileChangeThreadItem", "type": "object" }, { "properties": { "appContext": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallAppContext" }, { "type": "null" }] }, "arguments": true, "durationMs": { "description": "The duration of the MCP tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallError" }, { "type": "null" }] }, "id": { "type": "string" }, "mcpAppResourceUri": { "description": "Legacy compatibility field; prefer `mcpAppUi.resourceUri` when available.", "type": ["string", "null"] }, "mcpAppUi": { "anyOf": [{ "$ref": "#/definitions/v2/McpAppUi" }, { "type": "null" }], "description": "Presentation captured from the invoked descriptor; absent in older history." }, "pluginId": { "type": ["string", "null"] }, "readOnlyHint": { "type": ["boolean", "null"] }, "result": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallResult" }, { "type": "null" }] }, "server": { "type": "string" }, "status": { "$ref": "#/definitions/v2/McpToolCallStatus" }, "tool": { "type": "string" }, "type": { "enum": ["mcpToolCall"], "title": "McpToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "server", "status", "tool", "type"], "title": "McpToolCallThreadItem", "type": "object" }, { "properties": { "arguments": true, "contentItems": { "items": { "$ref": "#/definitions/v2/DynamicToolCallOutputContentItem" }, "type": ["array", "null"] }, "durationMs": { "description": "The duration of the dynamic tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "id": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/DynamicToolCallStatus" }, "success": { "type": ["boolean", "null"] }, "tool": { "type": "string" }, "type": { "enum": ["dynamicToolCall"], "title": "DynamicToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "status", "tool", "type"], "title": "DynamicToolCallThreadItem", "type": "object" }, { "properties": { "agentsStates": { "additionalProperties": { "$ref": "#/definitions/v2/CollabAgentState" }, "description": "Last known status of the target agents, when available.", "type": "object" }, "id": { "description": "Unique identifier for this collab tool call.", "type": "string" }, "model": { "description": "Model requested for the spawned agent, when applicable.", "type": ["string", "null"] }, "prompt": { "description": "Prompt text sent as part of the collab tool call, when available.", "type": ["string", "null"] }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }], "description": "Reasoning effort requested for the spawned agent, when applicable." }, "receiverThreadIds": { "description": "Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.", "items": { "type": "string" }, "type": "array" }, "senderThreadId": { "description": "Thread ID of the agent issuing the collab request.", "type": "string" }, "status": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentToolCallStatus" }], "description": "Current status of the collab tool call." }, "tool": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentTool" }], "description": "Name of the collab tool that was invoked." }, "type": { "enum": ["collabAgentToolCall"], "title": "CollabAgentToolCallThreadItemType", "type": "string" } }, "required": ["agentsStates", "id", "receiverThreadIds", "senderThreadId", "status", "tool", "type"], "title": "CollabAgentToolCallThreadItem", "type": "object" }, { "properties": { "agentPath": { "type": "string" }, "agentThreadId": { "type": "string" }, "id": { "type": "string" }, "kind": { "$ref": "#/definitions/v2/SubAgentActivityKind" }, "type": { "enum": ["subAgentActivity"], "title": "SubAgentActivityThreadItemType", "type": "string" } }, "required": ["agentPath", "agentThreadId", "id", "kind", "type"], "title": "SubAgentActivityThreadItem", "type": "object" }, { "properties": { "action": { "anyOf": [{ "$ref": "#/definitions/v2/WebSearchAction" }, { "type": "null" }] }, "id": { "type": "string" }, "query": { "type": "string" }, "results": { "default": null, "description": "Structured search results returned out-of-band by standalone web search.\n\nThese stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.", "items": true, "type": ["array", "null"] }, "type": { "enum": ["webSearch"], "title": "WebSearchThreadItemType", "type": "string" } }, "required": ["id", "query", "type"], "title": "WebSearchThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["imageView"], "title": "ImageViewThreadItemType", "type": "string" } }, "required": ["id", "path", "type"], "title": "ImageViewThreadItem", "type": "object" }, { "description": "Display item emitted by the interruptible `clock.sleep` tool.", "properties": { "durationMs": { "format": "uint64", "minimum": 0, "type": "integer" }, "id": { "type": "string" }, "type": { "enum": ["sleep"], "title": "SleepThreadItemType", "type": "string" } }, "required": ["durationMs", "id", "type"], "title": "SleepThreadItem", "type": "object" }, { "properties": { "failure": { "anyOf": [{ "$ref": "#/definitions/v2/ImageGenerationFailure" }, { "type": "null" }], "default": null }, "id": { "type": "string" }, "result": { "type": "string" }, "revisedPrompt": { "type": ["string", "null"] }, "savedPath": { "anyOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }, { "type": "null" }] }, "status": { "type": "string" }, "transparentBackground": { "default": null, "type": ["boolean", "null"] }, "type": { "enum": ["imageGeneration"], "title": "ImageGenerationThreadItemType", "type": "string" } }, "required": ["id", "result", "status", "type"], "title": "ImageGenerationThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["enteredReviewMode"], "title": "EnteredReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "EnteredReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["exitedReviewMode"], "title": "ExitedReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "ExitedReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "type": { "enum": ["contextCompaction"], "title": "ContextCompactionThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ContextCompactionThreadItem", "type": "object" }] };
var schema68 = { "enum": ["async"], "type": "string" };
var schema71 = { "description": 'Classifies an assistant message as interim commentary or final answer text.\n\nProviders do not emit this consistently, so callers must treat `None` as "phase unknown" and keep compatibility behavior for legacy models.', "oneOf": [{ "description": "Mid-turn assistant text (for example preamble/progress narration).\n\nAdditional tool calls or assistant output may follow before turn completion.", "enum": ["commentary"], "type": "string" }, { "description": "The assistant's terminal answer text for the current turn.", "enum": ["final_answer"], "type": "string" }] };
var schema72 = { "additionalProperties": false, "properties": { "options": { "items": { "type": "string" }, "type": ["array", "null"] }, "title": { "type": "string" } }, "required": ["title"], "type": "object" };
var schema79 = { "enum": ["agent", "userShell", "unifiedExecStartup", "unifiedExecInteraction"], "type": "string" };
var schema80 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema83 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema84 = { "properties": { "actionName": { "type": ["string", "null"] }, "appName": { "type": ["string", "null"] }, "connectorId": { "type": "string" }, "linkId": { "type": ["string", "null"] }, "resourceUri": { "type": ["string", "null"] } }, "required": ["connectorId"], "type": "object" };
var schema89 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema90 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "type": { "enum": ["inputText"], "title": "InputTextDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["text", "type"], "title": "InputTextDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "imageUrl": { "type": "string" }, "type": { "enum": ["inputImage"], "title": "InputImageDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["imageUrl", "type"], "title": "InputImageDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "audioUrl": { "type": "string" }, "type": { "enum": ["inputAudio"], "title": "InputAudioDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["audioUrl", "type"], "title": "InputAudioDynamicToolCallOutputContentItem", "type": "object" }] };
var schema91 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema95 = { "enum": ["inProgress", "completed", "failed", "interrupted"], "type": "string" };
var schema96 = { "enum": ["spawnAgent", "sendInput", "resumeAgent", "wait", "closeAgent", "sendMessage", "followupTask", "interruptAgent", "listAgents"], "type": "string" };
var schema97 = { "enum": ["started", "interacted", "interrupted", "completed"], "type": "string" };
var schema98 = { "oneOf": [{ "properties": { "queries": { "items": { "type": "string" }, "type": ["array", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "SearchWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["openPage"], "title": "OpenPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "OpenPageWebSearchAction", "type": "object" }, { "properties": { "pattern": { "type": ["string", "null"] }, "type": { "enum": ["findInPage"], "title": "FindInPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "FindInPageWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["other"], "title": "OtherWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "OtherWebSearchAction", "type": "object" }] };
var schema100 = { "oneOf": [{ "properties": { "limitId": { "type": "string" }, "resetsAt": { "format": "int64", "type": ["integer", "null"] }, "type": { "enum": ["usageLimitExceeded"], "title": "UsageLimitExceededImageGenerationFailureType", "type": "string" } }, "required": ["limitId", "type"], "title": "UsageLimitExceededImageGenerationFailure", "type": "object" }] };
var schema62 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "text_elements": { "default": [], "description": "UI-defined spans within `text` used to render or persist special elements.", "items": { "$ref": "#/definitions/v2/TextElement" }, "type": "array" }, "type": { "enum": ["text"], "title": "TextUserInputType", "type": "string" } }, "required": ["text", "type"], "title": "TextUserInput", "type": "object" }, { "anyOf": [{ "properties": { "url": { "type": "string" } }, "required": ["url"], "title": "UrlUserInput", "type": "object" }, { "properties": { "fileId": { "type": "string" } }, "required": ["fileId"], "title": "FileIdUserInput", "type": "object" }], "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "type": { "enum": ["image"], "title": "ImageUserInputType", "type": "string" } }, "required": ["type"], "title": "ImageUserInput", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "path": { "type": "string" }, "type": { "enum": ["localImage"], "title": "LocalImageUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalImageUserInput", "type": "object" }, { "properties": { "type": { "enum": ["audio"], "title": "AudioUserInputType", "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"], "title": "AudioUserInput", "type": "object" }, { "properties": { "path": { "type": "string" }, "type": { "enum": ["localAudio"], "title": "LocalAudioUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalAudioUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["skill"], "title": "SkillUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "SkillUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["mention"], "title": "MentionUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "MentionUserInput", "type": "object" }] };
var schema65 = { "enum": ["auto", "low", "high", "original"], "type": "string" };
var schema63 = { "properties": { "byteRange": { "allOf": [{ "$ref": "#/definitions/v2/ByteRange" }], "description": "Byte range in the parent `text` buffer that this element occupies." }, "placeholder": { "description": "Optional human-readable placeholder for the element, displayed in the UI.", "type": ["string", "null"] } }, "required": ["byteRange"], "type": "object" };
function validate49(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.byteRange === void 0 && (missing0 = "byteRange")) {
        validate49.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                validate49.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.end !== void 0) {
                  let data1 = data0.end;
                  const _errs5 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate49.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  if (errors === _errs5) {
                    if (typeof data1 == "number" && isFinite(data1)) {
                      if (data1 < 0 || isNaN(data1)) {
                        validate49.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                      validate49.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/type", keyword: "type", params: { type: "integer" } }];
                      return false;
                    }
                    if (errors === _errs7) {
                      if (typeof data2 == "number" && isFinite(data2)) {
                        if (data2 < 0 || isNaN(data2)) {
                          validate49.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
              validate49.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/type", keyword: "type", params: { type: "object" } }];
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
              validate49.errors = [{ instancePath: instancePath + "/placeholder", schemaPath: "#/properties/placeholder/type", keyword: "type", params: { type: schema63.properties.placeholder.type } }];
              return false;
            }
            var valid0 = _errs9 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate49.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate49.errors = vErrors;
  return errors === 0;
}
function validate48(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
                  if (!validate49(data1[i0], { instancePath: instancePath + "/text_elements/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
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
                const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[0].properties.type.enum } };
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
  const _errs12 = errors;
  let valid3 = false;
  const _errs13 = errors;
  if (errors === _errs13) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.url === void 0 && (missing1 = "url")) {
        const err6 = { instancePath, schemaPath: "#/oneOf/1/anyOf/0/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        if (data.url !== void 0) {
          if (typeof data.url !== "string") {
            const err7 = { instancePath: instancePath + "/url", schemaPath: "#/oneOf/1/anyOf/0/properties/url/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      }
    } else {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/anyOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
  }
  var _valid1 = _errs13 === errors;
  valid3 = valid3 || _valid1;
  if (!valid3) {
    const _errs17 = errors;
    if (errors === _errs17) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.fileId === void 0 && (missing2 = "fileId")) {
          const err9 = { instancePath, schemaPath: "#/oneOf/1/anyOf/1/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        } else {
          if (data.fileId !== void 0) {
            if (typeof data.fileId !== "string") {
              const err10 = { instancePath: instancePath + "/fileId", schemaPath: "#/oneOf/1/anyOf/1/properties/fileId/type", keyword: "type", params: { type: "string" } };
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
        const err11 = { instancePath, schemaPath: "#/oneOf/1/anyOf/1/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    var _valid1 = _errs17 === errors;
    valid3 = valid3 || _valid1;
  }
  if (!valid3) {
    const err12 = { instancePath, schemaPath: "#/oneOf/1/anyOf", keyword: "anyOf", params: {} };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
  } else {
    errors = _errs12;
    if (vErrors !== null) {
      if (_errs12) {
        vErrors.length = _errs12;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs10) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing3;
      if (data.type === void 0 && (missing3 = "type")) {
        const err13 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing3 } };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data6 = data.detail;
          const _errs21 = errors;
          const _errs22 = errors;
          let valid7 = false;
          const _errs23 = errors;
          if (typeof data6 !== "string") {
            const err14 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data6 === "auto" || data6 === "low" || data6 === "high" || data6 === "original")) {
            const err15 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema65.enum } };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          var _valid2 = _errs23 === errors;
          valid7 = valid7 || _valid2;
          if (!valid7) {
            const _errs26 = errors;
            if (data6 !== null) {
              const err16 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            var _valid2 = _errs26 === errors;
            valid7 = valid7 || _valid2;
          }
          if (!valid7) {
            const err17 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          } else {
            errors = _errs22;
            if (vErrors !== null) {
              if (_errs22) {
                vErrors.length = _errs22;
              } else {
                vErrors = null;
              }
            }
          }
          var valid6 = _errs21 === errors;
        } else {
          var valid6 = true;
        }
        if (valid6) {
          if (data.type !== void 0) {
            let data7 = data.type;
            const _errs28 = errors;
            if (typeof data7 !== "string") {
              const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (!(data7 === "image")) {
              const err19 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            var valid6 = _errs28 === errors;
          } else {
            var valid6 = true;
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
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs30 = errors;
    if (errors === _errs30) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing4;
        if (data.path === void 0 && (missing4 = "path") || data.type === void 0 && (missing4 = "type")) {
          const err21 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing4 } };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        } else {
          if (data.detail !== void 0) {
            let data8 = data.detail;
            const _errs32 = errors;
            const _errs33 = errors;
            let valid10 = false;
            const _errs34 = errors;
            if (typeof data8 !== "string") {
              const err22 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (!(data8 === "auto" || data8 === "low" || data8 === "high" || data8 === "original")) {
              const err23 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema65.enum } };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            var _valid3 = _errs34 === errors;
            valid10 = valid10 || _valid3;
            if (!valid10) {
              const _errs37 = errors;
              if (data8 !== null) {
                const err24 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/2/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              var _valid3 = _errs37 === errors;
              valid10 = valid10 || _valid3;
            }
            if (!valid10) {
              const err25 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/2/properties/detail/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            } else {
              errors = _errs33;
              if (vErrors !== null) {
                if (_errs33) {
                  vErrors.length = _errs33;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid9 = _errs32 === errors;
          } else {
            var valid9 = true;
          }
          if (valid9) {
            if (data.path !== void 0) {
              const _errs39 = errors;
              if (typeof data.path !== "string") {
                const err26 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/2/properties/path/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              var valid9 = _errs39 === errors;
            } else {
              var valid9 = true;
            }
            if (valid9) {
              if (data.type !== void 0) {
                let data10 = data.type;
                const _errs41 = errors;
                if (typeof data10 !== "string") {
                  const err27 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (!(data10 === "localImage")) {
                  const err28 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[2].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                var valid9 = _errs41 === errors;
              } else {
                var valid9 = true;
              }
            }
          }
        }
      } else {
        const err29 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    var _valid0 = _errs30 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs43 = errors;
      if (errors === _errs43) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing5;
          if (data.type === void 0 && (missing5 = "type") || data.url === void 0 && (missing5 = "url")) {
            const err30 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing5 } };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          } else {
            if (data.type !== void 0) {
              let data11 = data.type;
              const _errs45 = errors;
              if (typeof data11 !== "string") {
                const err31 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              if (!(data11 === "audio")) {
                const err32 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[3].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              var valid12 = _errs45 === errors;
            } else {
              var valid12 = true;
            }
            if (valid12) {
              if (data.url !== void 0) {
                const _errs47 = errors;
                if (typeof data.url !== "string") {
                  const err33 = { instancePath: instancePath + "/url", schemaPath: "#/oneOf/3/properties/url/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                var valid12 = _errs47 === errors;
              } else {
                var valid12 = true;
              }
            }
          }
        } else {
          const err34 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      var _valid0 = _errs43 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs49 = errors;
        if (errors === _errs49) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing6;
            if (data.path === void 0 && (missing6 = "path") || data.type === void 0 && (missing6 = "type")) {
              const err35 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing6 } };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            } else {
              if (data.path !== void 0) {
                const _errs51 = errors;
                if (typeof data.path !== "string") {
                  const err36 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/4/properties/path/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                var valid13 = _errs51 === errors;
              } else {
                var valid13 = true;
              }
              if (valid13) {
                if (data.type !== void 0) {
                  let data14 = data.type;
                  const _errs53 = errors;
                  if (typeof data14 !== "string") {
                    const err37 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                  if (!(data14 === "localAudio")) {
                    const err38 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[4].properties.type.enum } };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                  var valid13 = _errs53 === errors;
                } else {
                  var valid13 = true;
                }
              }
            }
          } else {
            const err39 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        var _valid0 = _errs49 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs55 = errors;
          if (errors === _errs55) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing7;
              if (data.name === void 0 && (missing7 = "name") || data.path === void 0 && (missing7 = "path") || data.type === void 0 && (missing7 = "type")) {
                const err40 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing7 } };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              } else {
                if (data.name !== void 0) {
                  const _errs57 = errors;
                  if (typeof data.name !== "string") {
                    const err41 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/5/properties/name/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  var valid14 = _errs57 === errors;
                } else {
                  var valid14 = true;
                }
                if (valid14) {
                  if (data.path !== void 0) {
                    const _errs59 = errors;
                    if (typeof data.path !== "string") {
                      const err42 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/5/properties/path/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                    var valid14 = _errs59 === errors;
                  } else {
                    var valid14 = true;
                  }
                  if (valid14) {
                    if (data.type !== void 0) {
                      let data17 = data.type;
                      const _errs61 = errors;
                      if (typeof data17 !== "string") {
                        const err43 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err43];
                        } else {
                          vErrors.push(err43);
                        }
                        errors++;
                      }
                      if (!(data17 === "skill")) {
                        const err44 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[5].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err44];
                        } else {
                          vErrors.push(err44);
                        }
                        errors++;
                      }
                      var valid14 = _errs61 === errors;
                    } else {
                      var valid14 = true;
                    }
                  }
                }
              }
            } else {
              const err45 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
          }
          var _valid0 = _errs55 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs63 = errors;
            if (errors === _errs63) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing8;
                if (data.name === void 0 && (missing8 = "name") || data.path === void 0 && (missing8 = "path") || data.type === void 0 && (missing8 = "type")) {
                  const err46 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing8 } };
                  if (vErrors === null) {
                    vErrors = [err46];
                  } else {
                    vErrors.push(err46);
                  }
                  errors++;
                } else {
                  if (data.name !== void 0) {
                    const _errs65 = errors;
                    if (typeof data.name !== "string") {
                      const err47 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/6/properties/name/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err47];
                      } else {
                        vErrors.push(err47);
                      }
                      errors++;
                    }
                    var valid15 = _errs65 === errors;
                  } else {
                    var valid15 = true;
                  }
                  if (valid15) {
                    if (data.path !== void 0) {
                      const _errs67 = errors;
                      if (typeof data.path !== "string") {
                        const err48 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/6/properties/path/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err48];
                        } else {
                          vErrors.push(err48);
                        }
                        errors++;
                      }
                      var valid15 = _errs67 === errors;
                    } else {
                      var valid15 = true;
                    }
                    if (valid15) {
                      if (data.type !== void 0) {
                        let data20 = data.type;
                        const _errs69 = errors;
                        if (typeof data20 !== "string") {
                          const err49 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err49];
                          } else {
                            vErrors.push(err49);
                          }
                          errors++;
                        }
                        if (!(data20 === "mention")) {
                          const err50 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[6].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err50];
                          } else {
                            vErrors.push(err50);
                          }
                          errors++;
                        }
                        var valid15 = _errs69 === errors;
                      } else {
                        var valid15 = true;
                      }
                    }
                  }
                }
              } else {
                const err51 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            var _valid0 = _errs63 === errors;
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
    const err52 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err52];
    } else {
      vErrors.push(err52);
    }
    errors++;
    validate48.errors = vErrors;
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
  validate48.errors = vErrors;
  return errors === 0;
}
function validate52(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.entries === void 0 && (missing0 = "entries") || data.threadIds === void 0 && (missing0 = "threadIds")) {
        validate52.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                      validate52.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/required", keyword: "required", params: { missingProperty: missing1 } }];
                      return false;
                    } else {
                      if (data1.lineEnd !== void 0) {
                        let data2 = data1.lineEnd;
                        const _errs6 = errors;
                        if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                          validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        if (errors === _errs6) {
                          if (typeof data2 == "number" && isFinite(data2)) {
                            if (data2 < 0 || isNaN(data2)) {
                              validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                            validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/type", keyword: "type", params: { type: "integer" } }];
                            return false;
                          }
                          if (errors === _errs8) {
                            if (typeof data3 == "number" && isFinite(data3)) {
                              if (data3 < 0 || isNaN(data3)) {
                                validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                              validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/note", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/note/type", keyword: "type", params: { type: "string" } }];
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
                                validate52.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/path", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/path/type", keyword: "type", params: { type: "string" } }];
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
                    validate52.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/type", keyword: "type", params: { type: "object" } }];
                    return false;
                  }
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate52.errors = [{ instancePath: instancePath + "/entries", schemaPath: "#/properties/entries/type", keyword: "type", params: { type: "array" } }];
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
                    validate52.errors = [{ instancePath: instancePath + "/threadIds/" + i1, schemaPath: "#/properties/threadIds/items/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid4 = _errs16 === errors;
                  if (!valid4) {
                    break;
                  }
                }
              } else {
                validate52.errors = [{ instancePath: instancePath + "/threadIds", schemaPath: "#/properties/threadIds/type", keyword: "type", params: { type: "array" } }];
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
      validate52.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate52.errors = vErrors;
  return errors === 0;
}
var schema74 = { "description": "Responses API compatible content items that can be returned by a tool call. This is a subset of ContentItem with the types we support as function call outputs.", "oneOf": [{ "properties": { "text": { "type": "string" }, "type": { "enum": ["input_text"], "title": "InputTextFunctionCallOutputContentItemType", "type": "string" } }, "required": ["text", "type"], "title": "InputTextFunctionCallOutputContentItem", "type": "object" }, { "anyOf": [{ "properties": { "image_url": { "type": "string" } }, "required": ["image_url"], "title": "ImageUrlFunctionCallOutputContentItem", "type": "object" }, { "properties": { "file_id": { "type": "string" } }, "required": ["file_id"], "title": "FileIdFunctionCallOutputContentItem", "type": "object" }], "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }] }, "type": { "enum": ["input_image"], "title": "InputImageFunctionCallOutputContentItemType", "type": "string" } }, "required": ["type"], "title": "InputImageFunctionCallOutputContentItem", "type": "object" }, { "properties": { "audio_url": { "type": "string" }, "type": { "enum": ["input_audio"], "title": "InputAudioFunctionCallOutputContentItemType", "type": "string" } }, "required": ["audio_url", "type"], "title": "InputAudioFunctionCallOutputContentItem", "type": "object" }, { "properties": { "encrypted_content": { "type": "string" }, "type": { "enum": ["encrypted_content"], "title": "EncryptedContentFunctionCallOutputContentItemType", "type": "string" } }, "required": ["encrypted_content", "type"], "title": "EncryptedContentFunctionCallOutputContentItem", "type": "object" }] };
function validate55(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (data.type !== void 0) {
            let data1 = data.type;
            const _errs5 = errors;
            if (typeof data1 !== "string") {
              const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            if (!(data1 === "input_text")) {
              const err3 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema74.oneOf[0].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var valid1 = _errs5 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      const err4 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs7 = errors;
  const _errs9 = errors;
  let valid2 = false;
  const _errs10 = errors;
  if (errors === _errs10) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.image_url === void 0 && (missing1 = "image_url")) {
        const err5 = { instancePath, schemaPath: "#/oneOf/1/anyOf/0/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      } else {
        if (data.image_url !== void 0) {
          if (typeof data.image_url !== "string") {
            const err6 = { instancePath: instancePath + "/image_url", schemaPath: "#/oneOf/1/anyOf/0/properties/image_url/type", keyword: "type", params: { type: "string" } };
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
      const err7 = { instancePath, schemaPath: "#/oneOf/1/anyOf/0/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
  }
  var _valid1 = _errs10 === errors;
  valid2 = valid2 || _valid1;
  if (!valid2) {
    const _errs14 = errors;
    if (errors === _errs14) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing2;
        if (data.file_id === void 0 && (missing2 = "file_id")) {
          const err8 = { instancePath, schemaPath: "#/oneOf/1/anyOf/1/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        } else {
          if (data.file_id !== void 0) {
            if (typeof data.file_id !== "string") {
              const err9 = { instancePath: instancePath + "/file_id", schemaPath: "#/oneOf/1/anyOf/1/properties/file_id/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
      } else {
        const err10 = { instancePath, schemaPath: "#/oneOf/1/anyOf/1/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    var _valid1 = _errs14 === errors;
    valid2 = valid2 || _valid1;
  }
  if (!valid2) {
    const err11 = { instancePath, schemaPath: "#/oneOf/1/anyOf", keyword: "anyOf", params: {} };
    if (vErrors === null) {
      vErrors = [err11];
    } else {
      vErrors.push(err11);
    }
    errors++;
  } else {
    errors = _errs9;
    if (vErrors !== null) {
      if (_errs9) {
        vErrors.length = _errs9;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs7) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing3;
      if (data.type === void 0 && (missing3 = "type")) {
        const err12 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing3 } };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data4 = data.detail;
          const _errs18 = errors;
          const _errs19 = errors;
          let valid6 = false;
          const _errs20 = errors;
          if (typeof data4 !== "string") {
            const err13 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (!(data4 === "auto" || data4 === "low" || data4 === "high" || data4 === "original")) {
            const err14 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema65.enum } };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          var _valid2 = _errs20 === errors;
          valid6 = valid6 || _valid2;
          if (!valid6) {
            const _errs23 = errors;
            if (data4 !== null) {
              const err15 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            var _valid2 = _errs23 === errors;
            valid6 = valid6 || _valid2;
          }
          if (!valid6) {
            const err16 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          } else {
            errors = _errs19;
            if (vErrors !== null) {
              if (_errs19) {
                vErrors.length = _errs19;
              } else {
                vErrors = null;
              }
            }
          }
          var valid5 = _errs18 === errors;
        } else {
          var valid5 = true;
        }
        if (valid5) {
          if (data.type !== void 0) {
            let data5 = data.type;
            const _errs25 = errors;
            if (typeof data5 !== "string") {
              const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (!(data5 === "input_image")) {
              const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema74.oneOf[1].properties.type.enum } };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            var valid5 = _errs25 === errors;
          } else {
            var valid5 = true;
          }
        }
      }
    } else {
      const err19 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" } };
      if (vErrors === null) {
        vErrors = [err19];
      } else {
        vErrors.push(err19);
      }
      errors++;
    }
  }
  var _valid0 = _errs7 === errors;
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
        let missing4;
        if (data.audio_url === void 0 && (missing4 = "audio_url") || data.type === void 0 && (missing4 = "type")) {
          const err20 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing4 } };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        } else {
          if (data.audio_url !== void 0) {
            const _errs29 = errors;
            if (typeof data.audio_url !== "string") {
              const err21 = { instancePath: instancePath + "/audio_url", schemaPath: "#/oneOf/2/properties/audio_url/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            var valid8 = _errs29 === errors;
          } else {
            var valid8 = true;
          }
          if (valid8) {
            if (data.type !== void 0) {
              let data7 = data.type;
              const _errs31 = errors;
              if (typeof data7 !== "string") {
                const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              if (!(data7 === "input_audio")) {
                const err23 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema74.oneOf[2].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              var valid8 = _errs31 === errors;
            } else {
              var valid8 = true;
            }
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
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
      const _errs33 = errors;
      if (errors === _errs33) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing5;
          if (data.encrypted_content === void 0 && (missing5 = "encrypted_content") || data.type === void 0 && (missing5 = "type")) {
            const err25 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing5 } };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          } else {
            if (data.encrypted_content !== void 0) {
              const _errs35 = errors;
              if (typeof data.encrypted_content !== "string") {
                const err26 = { instancePath: instancePath + "/encrypted_content", schemaPath: "#/oneOf/3/properties/encrypted_content/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              var valid9 = _errs35 === errors;
            } else {
              var valid9 = true;
            }
            if (valid9) {
              if (data.type !== void 0) {
                let data9 = data.type;
                const _errs37 = errors;
                if (typeof data9 !== "string") {
                  const err27 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (!(data9 === "encrypted_content")) {
                  const err28 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema74.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                var valid9 = _errs37 === errors;
              } else {
                var valid9 = true;
              }
            }
          }
        } else {
          const err29 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      var _valid0 = _errs33 === errors;
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
    const err30 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err30];
    } else {
      vErrors.push(err30);
    }
    errors++;
    validate55.errors = vErrors;
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
  validate55.errors = vErrors;
  return errors === 0;
}
function validate54(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  if (typeof data !== "string") {
    const err0 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "string" } };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs3 = errors;
    if (errors === _errs3) {
      if (Array.isArray(data)) {
        var valid1 = true;
        const len0 = data.length;
        for (let i0 = 0; i0 < len0; i0++) {
          const _errs5 = errors;
          if (!validate55(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
            errors = vErrors.length;
          }
          var valid1 = _errs5 === errors;
          if (!valid1) {
            break;
          }
        }
      } else {
        const err1 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "array" } };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err2 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {} };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
    validate54.errors = vErrors;
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
  validate54.errors = vErrors;
  return errors === 0;
}
var schema76 = { "oneOf": [{ "properties": { "command": { "type": "string" }, "name": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["read"], "title": "ReadCommandActionType", "type": "string" } }, "required": ["command", "name", "path", "type"], "title": "ReadCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "type": { "enum": ["listFiles"], "title": "ListFilesCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "ListFilesCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "SearchCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "type": { "enum": ["unknown"], "title": "UnknownCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "UnknownCommandAction", "type": "object" }] };
function validate58(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[0].properties.type.enum } };
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
              const err9 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/1/properties/path/type", keyword: "type", params: { type: schema76.oneOf[1].properties.path.type } };
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
                const err11 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[1].properties.type.enum } };
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
                const err15 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/2/properties/path/type", keyword: "type", params: { type: schema76.oneOf[2].properties.path.type } };
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
                  const err16 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/2/properties/query/type", keyword: "type", params: { type: schema76.oneOf[2].properties.query.type } };
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
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[2].properties.type.enum } };
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
                  const err23 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[3].properties.type.enum } };
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
    validate58.errors = vErrors;
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
  validate58.errors = vErrors;
  return errors === 0;
}
var schema82 = { "oneOf": [{ "properties": { "type": { "enum": ["add"], "title": "AddPatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "AddPatchChangeKind", "type": "object" }, { "properties": { "type": { "enum": ["delete"], "title": "DeletePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "DeletePatchChangeKind", "type": "object" }, { "properties": { "move_path": { "type": ["string", "null"] }, "type": { "enum": ["update"], "title": "UpdatePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "UpdatePatchChangeKind", "type": "object" }] };
function validate60(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.diff === void 0 && (missing0 = "diff") || data.kind === void 0 && (missing0 = "kind") || data.path === void 0 && (missing0 = "path")) {
        validate60.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.diff !== void 0) {
          const _errs1 = errors;
          if (typeof data.diff !== "string") {
            validate60.errors = [{ instancePath: instancePath + "/diff", schemaPath: "#/properties/diff/type", keyword: "type", params: { type: "string" } }];
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
                      const err2 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema82.oneOf[0].properties.type.enum } };
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
                      const err6 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema82.oneOf[1].properties.type.enum } };
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
                        const err9 = { instancePath: instancePath + "/kind/move_path", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/move_path/type", keyword: "type", params: { type: schema82.oneOf[2].properties.move_path.type } };
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
                          const err11 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema82.oneOf[2].properties.type.enum } };
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
              validate60.errors = vErrors;
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
                validate60.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: "string" } }];
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
      validate60.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate60.errors = vErrors;
  return errors === 0;
}
var schema87 = { "enum": ["inline", "fullscreen"], "type": "string" };
function validate62(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.preferredModelDisplayMode === void 0 && (missing0 = "preferredModelDisplayMode") || data.resourceUri === void 0 && (missing0 = "resourceUri")) {
        validate62.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.preferredModelDisplayMode !== void 0) {
          let data0 = data.preferredModelDisplayMode;
          const _errs1 = errors;
          if (typeof data0 !== "string") {
            validate62.errors = [{ instancePath: instancePath + "/preferredModelDisplayMode", schemaPath: "#/definitions/v2/McpAppDisplayMode/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "inline" || data0 === "fullscreen")) {
            validate62.errors = [{ instancePath: instancePath + "/preferredModelDisplayMode", schemaPath: "#/definitions/v2/McpAppDisplayMode/enum", keyword: "enum", params: { allowedValues: schema87.enum } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.resourceUri !== void 0) {
            const _errs4 = errors;
            if (typeof data.resourceUri !== "string") {
              validate62.errors = [{ instancePath: instancePath + "/resourceUri", schemaPath: "#/properties/resourceUri/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs4 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate62.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate62.errors = vErrors;
  return errors === 0;
}
var schema92 = { "properties": { "message": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/CollabAgentStatus" } }, "required": ["status"], "type": "object" };
var schema93 = { "enum": ["pendingInit", "running", "interrupted", "completed", "errored", "shutdown", "notFound"], "type": "string" };
function validate64(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate64.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.message !== void 0) {
          let data0 = data.message;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate64.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: schema92.properties.message.type } }];
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
              validate64.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data1 === "pendingInit" || data1 === "running" || data1 === "interrupted" || data1 === "completed" || data1 === "errored" || data1 === "shutdown" || data1 === "notFound")) {
              validate64.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/enum", keyword: "enum", params: { allowedValues: schema93.enum } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate64.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate64.errors = vErrors;
  return errors === 0;
}
function validate47(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err1 = { instancePath: instancePath + "/clientId", schemaPath: "#/oneOf/0/properties/clientId/type", keyword: "type", params: { type: schema61.oneOf[0].properties.clientId.type } };
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
                  if (!validate48(data1[i0], { instancePath: instancePath + "/content/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
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
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[0].properties.type.enum } };
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
                const err15 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[1].properties.type.enum } };
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
          if (data.delivery !== void 0) {
            let data11 = data.delivery;
            const _errs29 = errors;
            const _errs30 = errors;
            let valid8 = false;
            const _errs31 = errors;
            if (typeof data11 !== "string") {
              const err18 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/v2/AgentMessageDelivery/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (!(data11 === "async")) {
              const err19 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/v2/AgentMessageDelivery/enum", keyword: "enum", params: { allowedValues: schema68.enum } };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            var _valid1 = _errs31 === errors;
            valid8 = valid8 || _valid1;
            if (!valid8) {
              const _errs34 = errors;
              if (data11 !== null) {
                const err20 = { instancePath: instancePath + "/delivery", schemaPath: "#/oneOf/2/properties/delivery/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              var _valid1 = _errs34 === errors;
              valid8 = valid8 || _valid1;
            }
            if (!valid8) {
              const err21 = { instancePath: instancePath + "/delivery", schemaPath: "#/oneOf/2/properties/delivery/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            } else {
              errors = _errs30;
              if (vErrors !== null) {
                if (_errs30) {
                  vErrors.length = _errs30;
                } else {
                  vErrors = null;
                }
              }
            }
            var valid7 = _errs29 === errors;
          } else {
            var valid7 = true;
          }
          if (valid7) {
            if (data.id !== void 0) {
              const _errs36 = errors;
              if (typeof data.id !== "string") {
                const err22 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              var valid7 = _errs36 === errors;
            } else {
              var valid7 = true;
            }
            if (valid7) {
              if (data.memoryCitation !== void 0) {
                let data13 = data.memoryCitation;
                const _errs38 = errors;
                const _errs39 = errors;
                let valid10 = false;
                const _errs40 = errors;
                if (!validate52(data13, { instancePath: instancePath + "/memoryCitation", parentData: data, parentDataProperty: "memoryCitation", rootData })) {
                  vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
                  errors = vErrors.length;
                }
                var _valid2 = _errs40 === errors;
                valid10 = valid10 || _valid2;
                if (!valid10) {
                  const _errs41 = errors;
                  if (data13 !== null) {
                    const err23 = { instancePath: instancePath + "/memoryCitation", schemaPath: "#/oneOf/2/properties/memoryCitation/anyOf/1/type", keyword: "type", params: { type: "null" } };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                  var _valid2 = _errs41 === errors;
                  valid10 = valid10 || _valid2;
                }
                if (!valid10) {
                  const err24 = { instancePath: instancePath + "/memoryCitation", schemaPath: "#/oneOf/2/properties/memoryCitation/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                } else {
                  errors = _errs39;
                  if (vErrors !== null) {
                    if (_errs39) {
                      vErrors.length = _errs39;
                    } else {
                      vErrors = null;
                    }
                  }
                }
                var valid7 = _errs38 === errors;
              } else {
                var valid7 = true;
              }
              if (valid7) {
                if (data.phase !== void 0) {
                  let data14 = data.phase;
                  const _errs43 = errors;
                  const _errs44 = errors;
                  let valid11 = false;
                  const _errs45 = errors;
                  const _errs47 = errors;
                  let valid13 = false;
                  let passing1 = null;
                  const _errs48 = errors;
                  if (typeof data14 !== "string") {
                    const err25 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/0/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                  if (!(data14 === "commentary")) {
                    const err26 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema71.oneOf[0].enum } };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                  var _valid4 = _errs48 === errors;
                  if (_valid4) {
                    valid13 = true;
                    passing1 = 0;
                  }
                  const _errs50 = errors;
                  if (typeof data14 !== "string") {
                    const err27 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/1/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                  if (!(data14 === "final_answer")) {
                    const err28 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema71.oneOf[1].enum } };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                  var _valid4 = _errs50 === errors;
                  if (_valid4 && valid13) {
                    valid13 = false;
                    passing1 = [passing1, 1];
                  } else {
                    if (_valid4) {
                      valid13 = true;
                      passing1 = 1;
                    }
                  }
                  if (!valid13) {
                    const err29 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 } };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  } else {
                    errors = _errs47;
                    if (vErrors !== null) {
                      if (_errs47) {
                        vErrors.length = _errs47;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                  var _valid3 = _errs45 === errors;
                  valid11 = valid11 || _valid3;
                  if (!valid11) {
                    const _errs52 = errors;
                    if (data14 !== null) {
                      const err30 = { instancePath: instancePath + "/phase", schemaPath: "#/oneOf/2/properties/phase/anyOf/1/type", keyword: "type", params: { type: "null" } };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                    var _valid3 = _errs52 === errors;
                    valid11 = valid11 || _valid3;
                  }
                  if (!valid11) {
                    const err31 = { instancePath: instancePath + "/phase", schemaPath: "#/oneOf/2/properties/phase/anyOf", keyword: "anyOf", params: {} };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  } else {
                    errors = _errs44;
                    if (vErrors !== null) {
                      if (_errs44) {
                        vErrors.length = _errs44;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                  var valid7 = _errs43 === errors;
                } else {
                  var valid7 = true;
                }
                if (valid7) {
                  if (data.questions !== void 0) {
                    let data15 = data.questions;
                    const _errs54 = errors;
                    if (!Array.isArray(data15) && data15 !== null) {
                      const err32 = { instancePath: instancePath + "/questions", schemaPath: "#/oneOf/2/properties/questions/type", keyword: "type", params: { type: schema61.oneOf[2].properties.questions.type } };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                    if (errors === _errs54) {
                      if (Array.isArray(data15)) {
                        var valid14 = true;
                        const len2 = data15.length;
                        for (let i2 = 0; i2 < len2; i2++) {
                          let data16 = data15[i2];
                          const _errs56 = errors;
                          const _errs57 = errors;
                          if (errors === _errs57) {
                            if (data16 && typeof data16 == "object" && !Array.isArray(data16)) {
                              let missing4;
                              if (data16.title === void 0 && (missing4 = "title")) {
                                const err33 = { instancePath: instancePath + "/questions/" + i2, schemaPath: "#/definitions/v2/AsyncUserInputQuestion/required", keyword: "required", params: { missingProperty: missing4 } };
                                if (vErrors === null) {
                                  vErrors = [err33];
                                } else {
                                  vErrors.push(err33);
                                }
                                errors++;
                              } else {
                                const _errs59 = errors;
                                for (const key0 in data16) {
                                  if (!(key0 === "options" || key0 === "title")) {
                                    const err34 = { instancePath: instancePath + "/questions/" + i2, schemaPath: "#/definitions/v2/AsyncUserInputQuestion/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 } };
                                    if (vErrors === null) {
                                      vErrors = [err34];
                                    } else {
                                      vErrors.push(err34);
                                    }
                                    errors++;
                                    break;
                                  }
                                }
                                if (_errs59 === errors) {
                                  if (data16.options !== void 0) {
                                    let data17 = data16.options;
                                    const _errs60 = errors;
                                    if (!Array.isArray(data17) && data17 !== null) {
                                      const err35 = { instancePath: instancePath + "/questions/" + i2 + "/options", schemaPath: "#/definitions/v2/AsyncUserInputQuestion/properties/options/type", keyword: "type", params: { type: schema72.properties.options.type } };
                                      if (vErrors === null) {
                                        vErrors = [err35];
                                      } else {
                                        vErrors.push(err35);
                                      }
                                      errors++;
                                    }
                                    if (errors === _errs60) {
                                      if (Array.isArray(data17)) {
                                        var valid17 = true;
                                        const len3 = data17.length;
                                        for (let i3 = 0; i3 < len3; i3++) {
                                          const _errs62 = errors;
                                          if (typeof data17[i3] !== "string") {
                                            const err36 = { instancePath: instancePath + "/questions/" + i2 + "/options/" + i3, schemaPath: "#/definitions/v2/AsyncUserInputQuestion/properties/options/items/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err36];
                                            } else {
                                              vErrors.push(err36);
                                            }
                                            errors++;
                                          }
                                          var valid17 = _errs62 === errors;
                                          if (!valid17) {
                                            break;
                                          }
                                        }
                                      }
                                    }
                                    var valid16 = _errs60 === errors;
                                  } else {
                                    var valid16 = true;
                                  }
                                  if (valid16) {
                                    if (data16.title !== void 0) {
                                      const _errs64 = errors;
                                      if (typeof data16.title !== "string") {
                                        const err37 = { instancePath: instancePath + "/questions/" + i2 + "/title", schemaPath: "#/definitions/v2/AsyncUserInputQuestion/properties/title/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err37];
                                        } else {
                                          vErrors.push(err37);
                                        }
                                        errors++;
                                      }
                                      var valid16 = _errs64 === errors;
                                    } else {
                                      var valid16 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err38 = { instancePath: instancePath + "/questions/" + i2, schemaPath: "#/definitions/v2/AsyncUserInputQuestion/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err38];
                              } else {
                                vErrors.push(err38);
                              }
                              errors++;
                            }
                          }
                          var valid14 = _errs56 === errors;
                          if (!valid14) {
                            break;
                          }
                        }
                      }
                    }
                    var valid7 = _errs54 === errors;
                  } else {
                    var valid7 = true;
                  }
                  if (valid7) {
                    if (data.text !== void 0) {
                      const _errs66 = errors;
                      if (typeof data.text !== "string") {
                        const err39 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/2/properties/text/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err39];
                        } else {
                          vErrors.push(err39);
                        }
                        errors++;
                      }
                      var valid7 = _errs66 === errors;
                    } else {
                      var valid7 = true;
                    }
                    if (valid7) {
                      if (data.type !== void 0) {
                        let data21 = data.type;
                        const _errs68 = errors;
                        if (typeof data21 !== "string") {
                          const err40 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err40];
                          } else {
                            vErrors.push(err40);
                          }
                          errors++;
                        }
                        if (!(data21 === "agentMessage")) {
                          const err41 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[2].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err41];
                          } else {
                            vErrors.push(err41);
                          }
                          errors++;
                        }
                        var valid7 = _errs68 === errors;
                      } else {
                        var valid7 = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        const err42 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err42];
        } else {
          vErrors.push(err42);
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
      const _errs70 = errors;
      if (errors === _errs70) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing5;
          if (data.id === void 0 && (missing5 = "id") || data.name === void 0 && (missing5 = "name") || data.output === void 0 && (missing5 = "output") || data.type === void 0 && (missing5 = "type")) {
            const err43 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing5 } };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          } else {
            if (data.id !== void 0) {
              const _errs72 = errors;
              if (typeof data.id !== "string") {
                const err44 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/3/properties/id/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
              var valid18 = _errs72 === errors;
            } else {
              var valid18 = true;
            }
            if (valid18) {
              if (data.name !== void 0) {
                const _errs74 = errors;
                if (typeof data.name !== "string") {
                  const err45 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/3/properties/name/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
                var valid18 = _errs74 === errors;
              } else {
                var valid18 = true;
              }
              if (valid18) {
                if (data.namespace !== void 0) {
                  let data24 = data.namespace;
                  const _errs76 = errors;
                  if (typeof data24 !== "string" && data24 !== null) {
                    const err46 = { instancePath: instancePath + "/namespace", schemaPath: "#/oneOf/3/properties/namespace/type", keyword: "type", params: { type: schema61.oneOf[3].properties.namespace.type } };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                  var valid18 = _errs76 === errors;
                } else {
                  var valid18 = true;
                }
                if (valid18) {
                  if (data.output !== void 0) {
                    const _errs78 = errors;
                    if (!validate54(data.output, { instancePath: instancePath + "/output", parentData: data, parentDataProperty: "output", rootData })) {
                      vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
                      errors = vErrors.length;
                    }
                    var valid18 = _errs78 === errors;
                  } else {
                    var valid18 = true;
                  }
                  if (valid18) {
                    if (data.type !== void 0) {
                      let data26 = data.type;
                      const _errs79 = errors;
                      if (typeof data26 !== "string") {
                        const err47 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err47];
                        } else {
                          vErrors.push(err47);
                        }
                        errors++;
                      }
                      if (!(data26 === "functionCallOutput")) {
                        const err48 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[3].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err48];
                        } else {
                          vErrors.push(err48);
                        }
                        errors++;
                      }
                      var valid18 = _errs79 === errors;
                    } else {
                      var valid18 = true;
                    }
                  }
                }
              }
            }
          }
        } else {
          const err49 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      }
      var _valid0 = _errs70 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs81 = errors;
        if (errors === _errs81) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing6;
            if (data.id === void 0 && (missing6 = "id") || data.text === void 0 && (missing6 = "text") || data.type === void 0 && (missing6 = "type")) {
              const err50 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing6 } };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            } else {
              if (data.id !== void 0) {
                const _errs83 = errors;
                if (typeof data.id !== "string") {
                  const err51 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/4/properties/id/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err51];
                  } else {
                    vErrors.push(err51);
                  }
                  errors++;
                }
                var valid19 = _errs83 === errors;
              } else {
                var valid19 = true;
              }
              if (valid19) {
                if (data.text !== void 0) {
                  const _errs85 = errors;
                  if (typeof data.text !== "string") {
                    const err52 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/4/properties/text/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err52];
                    } else {
                      vErrors.push(err52);
                    }
                    errors++;
                  }
                  var valid19 = _errs85 === errors;
                } else {
                  var valid19 = true;
                }
                if (valid19) {
                  if (data.type !== void 0) {
                    let data29 = data.type;
                    const _errs87 = errors;
                    if (typeof data29 !== "string") {
                      const err53 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                    if (!(data29 === "plan")) {
                      const err54 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[4].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                    var valid19 = _errs87 === errors;
                  } else {
                    var valid19 = true;
                  }
                }
              }
            }
          } else {
            const err55 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        var _valid0 = _errs81 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs89 = errors;
          if (errors === _errs89) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing7;
              if (data.id === void 0 && (missing7 = "id") || data.type === void 0 && (missing7 = "type")) {
                const err56 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing7 } };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              } else {
                if (data.content !== void 0) {
                  let data30 = data.content;
                  const _errs91 = errors;
                  if (errors === _errs91) {
                    if (Array.isArray(data30)) {
                      var valid21 = true;
                      const len4 = data30.length;
                      for (let i4 = 0; i4 < len4; i4++) {
                        const _errs93 = errors;
                        if (typeof data30[i4] !== "string") {
                          const err57 = { instancePath: instancePath + "/content/" + i4, schemaPath: "#/oneOf/5/properties/content/items/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err57];
                          } else {
                            vErrors.push(err57);
                          }
                          errors++;
                        }
                        var valid21 = _errs93 === errors;
                        if (!valid21) {
                          break;
                        }
                      }
                    } else {
                      const err58 = { instancePath: instancePath + "/content", schemaPath: "#/oneOf/5/properties/content/type", keyword: "type", params: { type: "array" } };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                  }
                  var valid20 = _errs91 === errors;
                } else {
                  var valid20 = true;
                }
                if (valid20) {
                  if (data.id !== void 0) {
                    const _errs95 = errors;
                    if (typeof data.id !== "string") {
                      const err59 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/5/properties/id/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                    var valid20 = _errs95 === errors;
                  } else {
                    var valid20 = true;
                  }
                  if (valid20) {
                    if (data.summary !== void 0) {
                      let data33 = data.summary;
                      const _errs97 = errors;
                      if (errors === _errs97) {
                        if (Array.isArray(data33)) {
                          var valid22 = true;
                          const len5 = data33.length;
                          for (let i5 = 0; i5 < len5; i5++) {
                            const _errs99 = errors;
                            if (typeof data33[i5] !== "string") {
                              const err60 = { instancePath: instancePath + "/summary/" + i5, schemaPath: "#/oneOf/5/properties/summary/items/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err60];
                              } else {
                                vErrors.push(err60);
                              }
                              errors++;
                            }
                            var valid22 = _errs99 === errors;
                            if (!valid22) {
                              break;
                            }
                          }
                        } else {
                          const err61 = { instancePath: instancePath + "/summary", schemaPath: "#/oneOf/5/properties/summary/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err61];
                          } else {
                            vErrors.push(err61);
                          }
                          errors++;
                        }
                      }
                      var valid20 = _errs97 === errors;
                    } else {
                      var valid20 = true;
                    }
                    if (valid20) {
                      if (data.type !== void 0) {
                        let data35 = data.type;
                        const _errs101 = errors;
                        if (typeof data35 !== "string") {
                          const err62 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err62];
                          } else {
                            vErrors.push(err62);
                          }
                          errors++;
                        }
                        if (!(data35 === "reasoning")) {
                          const err63 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[5].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err63];
                          } else {
                            vErrors.push(err63);
                          }
                          errors++;
                        }
                        var valid20 = _errs101 === errors;
                      } else {
                        var valid20 = true;
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
          var _valid0 = _errs89 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs103 = errors;
            if (errors === _errs103) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing8;
                if (data.command === void 0 && (missing8 = "command") || data.commandActions === void 0 && (missing8 = "commandActions") || data.cwd === void 0 && (missing8 = "cwd") || data.id === void 0 && (missing8 = "id") || data.status === void 0 && (missing8 = "status") || data.type === void 0 && (missing8 = "type")) {
                  const err65 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing8 } };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                } else {
                  if (data.aggregatedOutput !== void 0) {
                    let data36 = data.aggregatedOutput;
                    const _errs105 = errors;
                    if (typeof data36 !== "string" && data36 !== null) {
                      const err66 = { instancePath: instancePath + "/aggregatedOutput", schemaPath: "#/oneOf/6/properties/aggregatedOutput/type", keyword: "type", params: { type: schema61.oneOf[6].properties.aggregatedOutput.type } };
                      if (vErrors === null) {
                        vErrors = [err66];
                      } else {
                        vErrors.push(err66);
                      }
                      errors++;
                    }
                    var valid23 = _errs105 === errors;
                  } else {
                    var valid23 = true;
                  }
                  if (valid23) {
                    if (data.command !== void 0) {
                      const _errs107 = errors;
                      if (typeof data.command !== "string") {
                        const err67 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/6/properties/command/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err67];
                        } else {
                          vErrors.push(err67);
                        }
                        errors++;
                      }
                      var valid23 = _errs107 === errors;
                    } else {
                      var valid23 = true;
                    }
                    if (valid23) {
                      if (data.commandActions !== void 0) {
                        let data38 = data.commandActions;
                        const _errs109 = errors;
                        if (errors === _errs109) {
                          if (Array.isArray(data38)) {
                            var valid24 = true;
                            const len6 = data38.length;
                            for (let i6 = 0; i6 < len6; i6++) {
                              const _errs111 = errors;
                              if (!validate58(data38[i6], { instancePath: instancePath + "/commandActions/" + i6, parentData: data38, parentDataProperty: i6, rootData })) {
                                vErrors = vErrors === null ? validate58.errors : vErrors.concat(validate58.errors);
                                errors = vErrors.length;
                              }
                              var valid24 = _errs111 === errors;
                              if (!valid24) {
                                break;
                              }
                            }
                          } else {
                            const err68 = { instancePath: instancePath + "/commandActions", schemaPath: "#/oneOf/6/properties/commandActions/type", keyword: "type", params: { type: "array" } };
                            if (vErrors === null) {
                              vErrors = [err68];
                            } else {
                              vErrors.push(err68);
                            }
                            errors++;
                          }
                        }
                        var valid23 = _errs109 === errors;
                      } else {
                        var valid23 = true;
                      }
                      if (valid23) {
                        if (data.cwd !== void 0) {
                          const _errs112 = errors;
                          if (typeof data.cwd !== "string") {
                            const err69 = { instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err69];
                            } else {
                              vErrors.push(err69);
                            }
                            errors++;
                          }
                          var valid23 = _errs112 === errors;
                        } else {
                          var valid23 = true;
                        }
                        if (valid23) {
                          if (data.durationMs !== void 0) {
                            let data41 = data.durationMs;
                            const _errs116 = errors;
                            if (!(typeof data41 == "number" && (!(data41 % 1) && !isNaN(data41)) && isFinite(data41)) && data41 !== null) {
                              const err70 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/6/properties/durationMs/type", keyword: "type", params: { type: schema61.oneOf[6].properties.durationMs.type } };
                              if (vErrors === null) {
                                vErrors = [err70];
                              } else {
                                vErrors.push(err70);
                              }
                              errors++;
                            }
                            var valid23 = _errs116 === errors;
                          } else {
                            var valid23 = true;
                          }
                          if (valid23) {
                            if (data.exitCode !== void 0) {
                              let data42 = data.exitCode;
                              const _errs118 = errors;
                              if (!(typeof data42 == "number" && (!(data42 % 1) && !isNaN(data42)) && isFinite(data42)) && data42 !== null) {
                                const err71 = { instancePath: instancePath + "/exitCode", schemaPath: "#/oneOf/6/properties/exitCode/type", keyword: "type", params: { type: schema61.oneOf[6].properties.exitCode.type } };
                                if (vErrors === null) {
                                  vErrors = [err71];
                                } else {
                                  vErrors.push(err71);
                                }
                                errors++;
                              }
                              var valid23 = _errs118 === errors;
                            } else {
                              var valid23 = true;
                            }
                            if (valid23) {
                              if (data.id !== void 0) {
                                const _errs120 = errors;
                                if (typeof data.id !== "string") {
                                  const err72 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/6/properties/id/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err72];
                                  } else {
                                    vErrors.push(err72);
                                  }
                                  errors++;
                                }
                                var valid23 = _errs120 === errors;
                              } else {
                                var valid23 = true;
                              }
                              if (valid23) {
                                if (data.pluginId !== void 0) {
                                  let data44 = data.pluginId;
                                  const _errs122 = errors;
                                  if (typeof data44 !== "string" && data44 !== null) {
                                    const err73 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/6/properties/pluginId/type", keyword: "type", params: { type: schema61.oneOf[6].properties.pluginId.type } };
                                    if (vErrors === null) {
                                      vErrors = [err73];
                                    } else {
                                      vErrors.push(err73);
                                    }
                                    errors++;
                                  }
                                  var valid23 = _errs122 === errors;
                                } else {
                                  var valid23 = true;
                                }
                                if (valid23) {
                                  if (data.processId !== void 0) {
                                    let data45 = data.processId;
                                    const _errs124 = errors;
                                    if (typeof data45 !== "string" && data45 !== null) {
                                      const err74 = { instancePath: instancePath + "/processId", schemaPath: "#/oneOf/6/properties/processId/type", keyword: "type", params: { type: schema61.oneOf[6].properties.processId.type } };
                                      if (vErrors === null) {
                                        vErrors = [err74];
                                      } else {
                                        vErrors.push(err74);
                                      }
                                      errors++;
                                    }
                                    var valid23 = _errs124 === errors;
                                  } else {
                                    var valid23 = true;
                                  }
                                  if (valid23) {
                                    if (data.scriptPath !== void 0) {
                                      let data46 = data.scriptPath;
                                      const _errs126 = errors;
                                      if (typeof data46 !== "string" && data46 !== null) {
                                        const err75 = { instancePath: instancePath + "/scriptPath", schemaPath: "#/oneOf/6/properties/scriptPath/type", keyword: "type", params: { type: schema61.oneOf[6].properties.scriptPath.type } };
                                        if (vErrors === null) {
                                          vErrors = [err75];
                                        } else {
                                          vErrors.push(err75);
                                        }
                                        errors++;
                                      }
                                      var valid23 = _errs126 === errors;
                                    } else {
                                      var valid23 = true;
                                    }
                                    if (valid23) {
                                      if (data.source !== void 0) {
                                        let data47 = data.source;
                                        const _errs128 = errors;
                                        if (typeof data47 !== "string") {
                                          const err76 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err76];
                                          } else {
                                            vErrors.push(err76);
                                          }
                                          errors++;
                                        }
                                        if (!(data47 === "agent" || data47 === "userShell" || data47 === "unifiedExecStartup" || data47 === "unifiedExecInteraction")) {
                                          const err77 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/enum", keyword: "enum", params: { allowedValues: schema79.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err77];
                                          } else {
                                            vErrors.push(err77);
                                          }
                                          errors++;
                                        }
                                        var valid23 = _errs128 === errors;
                                      } else {
                                        var valid23 = true;
                                      }
                                      if (valid23) {
                                        if (data.status !== void 0) {
                                          let data48 = data.status;
                                          const _errs132 = errors;
                                          if (typeof data48 !== "string") {
                                            const err78 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err78];
                                            } else {
                                              vErrors.push(err78);
                                            }
                                            errors++;
                                          }
                                          if (!(data48 === "inProgress" || data48 === "completed" || data48 === "failed" || data48 === "declined")) {
                                            const err79 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/enum", keyword: "enum", params: { allowedValues: schema80.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err79];
                                            } else {
                                              vErrors.push(err79);
                                            }
                                            errors++;
                                          }
                                          var valid23 = _errs132 === errors;
                                        } else {
                                          var valid23 = true;
                                        }
                                        if (valid23) {
                                          if (data.type !== void 0) {
                                            let data49 = data.type;
                                            const _errs135 = errors;
                                            if (typeof data49 !== "string") {
                                              const err80 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err80];
                                              } else {
                                                vErrors.push(err80);
                                              }
                                              errors++;
                                            }
                                            if (!(data49 === "commandExecution")) {
                                              const err81 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[6].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err81];
                                              } else {
                                                vErrors.push(err81);
                                              }
                                              errors++;
                                            }
                                            var valid23 = _errs135 === errors;
                                          } else {
                                            var valid23 = true;
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
                const err82 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
            }
            var _valid0 = _errs103 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
              const _errs137 = errors;
              if (errors === _errs137) {
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  let missing9;
                  if (data.changes === void 0 && (missing9 = "changes") || data.id === void 0 && (missing9 = "id") || data.status === void 0 && (missing9 = "status") || data.type === void 0 && (missing9 = "type")) {
                    const err83 = { instancePath, schemaPath: "#/oneOf/7/required", keyword: "required", params: { missingProperty: missing9 } };
                    if (vErrors === null) {
                      vErrors = [err83];
                    } else {
                      vErrors.push(err83);
                    }
                    errors++;
                  } else {
                    if (data.changes !== void 0) {
                      let data50 = data.changes;
                      const _errs139 = errors;
                      if (errors === _errs139) {
                        if (Array.isArray(data50)) {
                          var valid31 = true;
                          const len7 = data50.length;
                          for (let i7 = 0; i7 < len7; i7++) {
                            const _errs141 = errors;
                            if (!validate60(data50[i7], { instancePath: instancePath + "/changes/" + i7, parentData: data50, parentDataProperty: i7, rootData })) {
                              vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
                              errors = vErrors.length;
                            }
                            var valid31 = _errs141 === errors;
                            if (!valid31) {
                              break;
                            }
                          }
                        } else {
                          const err84 = { instancePath: instancePath + "/changes", schemaPath: "#/oneOf/7/properties/changes/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err84];
                          } else {
                            vErrors.push(err84);
                          }
                          errors++;
                        }
                      }
                      var valid30 = _errs139 === errors;
                    } else {
                      var valid30 = true;
                    }
                    if (valid30) {
                      if (data.id !== void 0) {
                        const _errs142 = errors;
                        if (typeof data.id !== "string") {
                          const err85 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/7/properties/id/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err85];
                          } else {
                            vErrors.push(err85);
                          }
                          errors++;
                        }
                        var valid30 = _errs142 === errors;
                      } else {
                        var valid30 = true;
                      }
                      if (valid30) {
                        if (data.status !== void 0) {
                          let data53 = data.status;
                          const _errs144 = errors;
                          if (typeof data53 !== "string") {
                            const err86 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err86];
                            } else {
                              vErrors.push(err86);
                            }
                            errors++;
                          }
                          if (!(data53 === "inProgress" || data53 === "completed" || data53 === "failed" || data53 === "declined")) {
                            const err87 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/enum", keyword: "enum", params: { allowedValues: schema83.enum } };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                          var valid30 = _errs144 === errors;
                        } else {
                          var valid30 = true;
                        }
                        if (valid30) {
                          if (data.type !== void 0) {
                            let data54 = data.type;
                            const _errs147 = errors;
                            if (typeof data54 !== "string") {
                              const err88 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err88];
                              } else {
                                vErrors.push(err88);
                              }
                              errors++;
                            }
                            if (!(data54 === "fileChange")) {
                              const err89 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[7].properties.type.enum } };
                              if (vErrors === null) {
                                vErrors = [err89];
                              } else {
                                vErrors.push(err89);
                              }
                              errors++;
                            }
                            var valid30 = _errs147 === errors;
                          } else {
                            var valid30 = true;
                          }
                        }
                      }
                    }
                  }
                } else {
                  const err90 = { instancePath, schemaPath: "#/oneOf/7/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err90];
                  } else {
                    vErrors.push(err90);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs137 === errors;
              if (_valid0 && valid0) {
                valid0 = false;
                passing0 = [passing0, 7];
              } else {
                if (_valid0) {
                  valid0 = true;
                  passing0 = 7;
                }
                const _errs149 = errors;
                if (errors === _errs149) {
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    let missing10;
                    if (data.arguments === void 0 && (missing10 = "arguments") || data.id === void 0 && (missing10 = "id") || data.server === void 0 && (missing10 = "server") || data.status === void 0 && (missing10 = "status") || data.tool === void 0 && (missing10 = "tool") || data.type === void 0 && (missing10 = "type")) {
                      const err91 = { instancePath, schemaPath: "#/oneOf/8/required", keyword: "required", params: { missingProperty: missing10 } };
                      if (vErrors === null) {
                        vErrors = [err91];
                      } else {
                        vErrors.push(err91);
                      }
                      errors++;
                    } else {
                      if (data.appContext !== void 0) {
                        let data55 = data.appContext;
                        const _errs151 = errors;
                        const _errs152 = errors;
                        let valid34 = false;
                        const _errs153 = errors;
                        const _errs154 = errors;
                        if (errors === _errs154) {
                          if (data55 && typeof data55 == "object" && !Array.isArray(data55)) {
                            let missing11;
                            if (data55.connectorId === void 0 && (missing11 = "connectorId")) {
                              const err92 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/required", keyword: "required", params: { missingProperty: missing11 } };
                              if (vErrors === null) {
                                vErrors = [err92];
                              } else {
                                vErrors.push(err92);
                              }
                              errors++;
                            } else {
                              if (data55.actionName !== void 0) {
                                let data56 = data55.actionName;
                                const _errs156 = errors;
                                if (typeof data56 !== "string" && data56 !== null) {
                                  const err93 = { instancePath: instancePath + "/appContext/actionName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/actionName/type", keyword: "type", params: { type: schema84.properties.actionName.type } };
                                  if (vErrors === null) {
                                    vErrors = [err93];
                                  } else {
                                    vErrors.push(err93);
                                  }
                                  errors++;
                                }
                                var valid36 = _errs156 === errors;
                              } else {
                                var valid36 = true;
                              }
                              if (valid36) {
                                if (data55.appName !== void 0) {
                                  let data57 = data55.appName;
                                  const _errs158 = errors;
                                  if (typeof data57 !== "string" && data57 !== null) {
                                    const err94 = { instancePath: instancePath + "/appContext/appName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/appName/type", keyword: "type", params: { type: schema84.properties.appName.type } };
                                    if (vErrors === null) {
                                      vErrors = [err94];
                                    } else {
                                      vErrors.push(err94);
                                    }
                                    errors++;
                                  }
                                  var valid36 = _errs158 === errors;
                                } else {
                                  var valid36 = true;
                                }
                                if (valid36) {
                                  if (data55.connectorId !== void 0) {
                                    const _errs160 = errors;
                                    if (typeof data55.connectorId !== "string") {
                                      const err95 = { instancePath: instancePath + "/appContext/connectorId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/connectorId/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err95];
                                      } else {
                                        vErrors.push(err95);
                                      }
                                      errors++;
                                    }
                                    var valid36 = _errs160 === errors;
                                  } else {
                                    var valid36 = true;
                                  }
                                  if (valid36) {
                                    if (data55.linkId !== void 0) {
                                      let data59 = data55.linkId;
                                      const _errs162 = errors;
                                      if (typeof data59 !== "string" && data59 !== null) {
                                        const err96 = { instancePath: instancePath + "/appContext/linkId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/linkId/type", keyword: "type", params: { type: schema84.properties.linkId.type } };
                                        if (vErrors === null) {
                                          vErrors = [err96];
                                        } else {
                                          vErrors.push(err96);
                                        }
                                        errors++;
                                      }
                                      var valid36 = _errs162 === errors;
                                    } else {
                                      var valid36 = true;
                                    }
                                    if (valid36) {
                                      if (data55.resourceUri !== void 0) {
                                        let data60 = data55.resourceUri;
                                        const _errs164 = errors;
                                        if (typeof data60 !== "string" && data60 !== null) {
                                          const err97 = { instancePath: instancePath + "/appContext/resourceUri", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/resourceUri/type", keyword: "type", params: { type: schema84.properties.resourceUri.type } };
                                          if (vErrors === null) {
                                            vErrors = [err97];
                                          } else {
                                            vErrors.push(err97);
                                          }
                                          errors++;
                                        }
                                        var valid36 = _errs164 === errors;
                                      } else {
                                        var valid36 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            const err98 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err98];
                            } else {
                              vErrors.push(err98);
                            }
                            errors++;
                          }
                        }
                        var _valid5 = _errs153 === errors;
                        valid34 = valid34 || _valid5;
                        if (!valid34) {
                          const _errs166 = errors;
                          if (data55 !== null) {
                            const err99 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/8/properties/appContext/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err99];
                            } else {
                              vErrors.push(err99);
                            }
                            errors++;
                          }
                          var _valid5 = _errs166 === errors;
                          valid34 = valid34 || _valid5;
                        }
                        if (!valid34) {
                          const err100 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/8/properties/appContext/anyOf", keyword: "anyOf", params: {} };
                          if (vErrors === null) {
                            vErrors = [err100];
                          } else {
                            vErrors.push(err100);
                          }
                          errors++;
                        } else {
                          errors = _errs152;
                          if (vErrors !== null) {
                            if (_errs152) {
                              vErrors.length = _errs152;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid33 = _errs151 === errors;
                      } else {
                        var valid33 = true;
                      }
                      if (valid33) {
                        if (data.durationMs !== void 0) {
                          let data61 = data.durationMs;
                          const _errs168 = errors;
                          if (!(typeof data61 == "number" && (!(data61 % 1) && !isNaN(data61)) && isFinite(data61)) && data61 !== null) {
                            const err101 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/8/properties/durationMs/type", keyword: "type", params: { type: schema61.oneOf[8].properties.durationMs.type } };
                            if (vErrors === null) {
                              vErrors = [err101];
                            } else {
                              vErrors.push(err101);
                            }
                            errors++;
                          }
                          var valid33 = _errs168 === errors;
                        } else {
                          var valid33 = true;
                        }
                        if (valid33) {
                          if (data.error !== void 0) {
                            let data62 = data.error;
                            const _errs170 = errors;
                            const _errs171 = errors;
                            let valid37 = false;
                            const _errs172 = errors;
                            const _errs173 = errors;
                            if (errors === _errs173) {
                              if (data62 && typeof data62 == "object" && !Array.isArray(data62)) {
                                let missing12;
                                if (data62.message === void 0 && (missing12 = "message")) {
                                  const err102 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/required", keyword: "required", params: { missingProperty: missing12 } };
                                  if (vErrors === null) {
                                    vErrors = [err102];
                                  } else {
                                    vErrors.push(err102);
                                  }
                                  errors++;
                                } else {
                                  if (data62.message !== void 0) {
                                    if (typeof data62.message !== "string") {
                                      const err103 = { instancePath: instancePath + "/error/message", schemaPath: "#/definitions/v2/McpToolCallError/properties/message/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err103];
                                      } else {
                                        vErrors.push(err103);
                                      }
                                      errors++;
                                    }
                                  }
                                }
                              } else {
                                const err104 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err104];
                                } else {
                                  vErrors.push(err104);
                                }
                                errors++;
                              }
                            }
                            var _valid6 = _errs172 === errors;
                            valid37 = valid37 || _valid6;
                            if (!valid37) {
                              const _errs177 = errors;
                              if (data62 !== null) {
                                const err105 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/8/properties/error/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                if (vErrors === null) {
                                  vErrors = [err105];
                                } else {
                                  vErrors.push(err105);
                                }
                                errors++;
                              }
                              var _valid6 = _errs177 === errors;
                              valid37 = valid37 || _valid6;
                            }
                            if (!valid37) {
                              const err106 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/8/properties/error/anyOf", keyword: "anyOf", params: {} };
                              if (vErrors === null) {
                                vErrors = [err106];
                              } else {
                                vErrors.push(err106);
                              }
                              errors++;
                            } else {
                              errors = _errs171;
                              if (vErrors !== null) {
                                if (_errs171) {
                                  vErrors.length = _errs171;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid33 = _errs170 === errors;
                          } else {
                            var valid33 = true;
                          }
                          if (valid33) {
                            if (data.id !== void 0) {
                              const _errs179 = errors;
                              if (typeof data.id !== "string") {
                                const err107 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/8/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err107];
                                } else {
                                  vErrors.push(err107);
                                }
                                errors++;
                              }
                              var valid33 = _errs179 === errors;
                            } else {
                              var valid33 = true;
                            }
                            if (valid33) {
                              if (data.mcpAppResourceUri !== void 0) {
                                let data65 = data.mcpAppResourceUri;
                                const _errs181 = errors;
                                if (typeof data65 !== "string" && data65 !== null) {
                                  const err108 = { instancePath: instancePath + "/mcpAppResourceUri", schemaPath: "#/oneOf/8/properties/mcpAppResourceUri/type", keyword: "type", params: { type: schema61.oneOf[8].properties.mcpAppResourceUri.type } };
                                  if (vErrors === null) {
                                    vErrors = [err108];
                                  } else {
                                    vErrors.push(err108);
                                  }
                                  errors++;
                                }
                                var valid33 = _errs181 === errors;
                              } else {
                                var valid33 = true;
                              }
                              if (valid33) {
                                if (data.mcpAppUi !== void 0) {
                                  let data66 = data.mcpAppUi;
                                  const _errs183 = errors;
                                  const _errs184 = errors;
                                  let valid40 = false;
                                  const _errs185 = errors;
                                  if (!validate62(data66, { instancePath: instancePath + "/mcpAppUi", parentData: data, parentDataProperty: "mcpAppUi", rootData })) {
                                    vErrors = vErrors === null ? validate62.errors : vErrors.concat(validate62.errors);
                                    errors = vErrors.length;
                                  }
                                  var _valid7 = _errs185 === errors;
                                  valid40 = valid40 || _valid7;
                                  if (!valid40) {
                                    const _errs186 = errors;
                                    if (data66 !== null) {
                                      const err109 = { instancePath: instancePath + "/mcpAppUi", schemaPath: "#/oneOf/8/properties/mcpAppUi/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                      if (vErrors === null) {
                                        vErrors = [err109];
                                      } else {
                                        vErrors.push(err109);
                                      }
                                      errors++;
                                    }
                                    var _valid7 = _errs186 === errors;
                                    valid40 = valid40 || _valid7;
                                  }
                                  if (!valid40) {
                                    const err110 = { instancePath: instancePath + "/mcpAppUi", schemaPath: "#/oneOf/8/properties/mcpAppUi/anyOf", keyword: "anyOf", params: {} };
                                    if (vErrors === null) {
                                      vErrors = [err110];
                                    } else {
                                      vErrors.push(err110);
                                    }
                                    errors++;
                                  } else {
                                    errors = _errs184;
                                    if (vErrors !== null) {
                                      if (_errs184) {
                                        vErrors.length = _errs184;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid33 = _errs183 === errors;
                                } else {
                                  var valid33 = true;
                                }
                                if (valid33) {
                                  if (data.pluginId !== void 0) {
                                    let data67 = data.pluginId;
                                    const _errs188 = errors;
                                    if (typeof data67 !== "string" && data67 !== null) {
                                      const err111 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/8/properties/pluginId/type", keyword: "type", params: { type: schema61.oneOf[8].properties.pluginId.type } };
                                      if (vErrors === null) {
                                        vErrors = [err111];
                                      } else {
                                        vErrors.push(err111);
                                      }
                                      errors++;
                                    }
                                    var valid33 = _errs188 === errors;
                                  } else {
                                    var valid33 = true;
                                  }
                                  if (valid33) {
                                    if (data.readOnlyHint !== void 0) {
                                      let data68 = data.readOnlyHint;
                                      const _errs190 = errors;
                                      if (typeof data68 !== "boolean" && data68 !== null) {
                                        const err112 = { instancePath: instancePath + "/readOnlyHint", schemaPath: "#/oneOf/8/properties/readOnlyHint/type", keyword: "type", params: { type: schema61.oneOf[8].properties.readOnlyHint.type } };
                                        if (vErrors === null) {
                                          vErrors = [err112];
                                        } else {
                                          vErrors.push(err112);
                                        }
                                        errors++;
                                      }
                                      var valid33 = _errs190 === errors;
                                    } else {
                                      var valid33 = true;
                                    }
                                    if (valid33) {
                                      if (data.result !== void 0) {
                                        let data69 = data.result;
                                        const _errs192 = errors;
                                        const _errs193 = errors;
                                        let valid41 = false;
                                        const _errs194 = errors;
                                        const _errs195 = errors;
                                        if (errors === _errs195) {
                                          if (data69 && typeof data69 == "object" && !Array.isArray(data69)) {
                                            let missing13;
                                            if (data69.content === void 0 && (missing13 = "content")) {
                                              const err113 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/required", keyword: "required", params: { missingProperty: missing13 } };
                                              if (vErrors === null) {
                                                vErrors = [err113];
                                              } else {
                                                vErrors.push(err113);
                                              }
                                              errors++;
                                            } else {
                                              if (data69.content !== void 0) {
                                                const _errs197 = errors;
                                                if (errors === _errs197) {
                                                  if (!Array.isArray(data69.content)) {
                                                    const err114 = { instancePath: instancePath + "/result/content", schemaPath: "#/definitions/v2/McpToolCallResult/properties/content/type", keyword: "type", params: { type: "array" } };
                                                    if (vErrors === null) {
                                                      vErrors = [err114];
                                                    } else {
                                                      vErrors.push(err114);
                                                    }
                                                    errors++;
                                                  }
                                                }
                                              }
                                            }
                                          } else {
                                            const err115 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/type", keyword: "type", params: { type: "object" } };
                                            if (vErrors === null) {
                                              vErrors = [err115];
                                            } else {
                                              vErrors.push(err115);
                                            }
                                            errors++;
                                          }
                                        }
                                        var _valid8 = _errs194 === errors;
                                        valid41 = valid41 || _valid8;
                                        if (!valid41) {
                                          const _errs199 = errors;
                                          if (data69 !== null) {
                                            const err116 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/8/properties/result/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                            if (vErrors === null) {
                                              vErrors = [err116];
                                            } else {
                                              vErrors.push(err116);
                                            }
                                            errors++;
                                          }
                                          var _valid8 = _errs199 === errors;
                                          valid41 = valid41 || _valid8;
                                        }
                                        if (!valid41) {
                                          const err117 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/8/properties/result/anyOf", keyword: "anyOf", params: {} };
                                          if (vErrors === null) {
                                            vErrors = [err117];
                                          } else {
                                            vErrors.push(err117);
                                          }
                                          errors++;
                                        } else {
                                          errors = _errs193;
                                          if (vErrors !== null) {
                                            if (_errs193) {
                                              vErrors.length = _errs193;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                        var valid33 = _errs192 === errors;
                                      } else {
                                        var valid33 = true;
                                      }
                                      if (valid33) {
                                        if (data.server !== void 0) {
                                          const _errs201 = errors;
                                          if (typeof data.server !== "string") {
                                            const err118 = { instancePath: instancePath + "/server", schemaPath: "#/oneOf/8/properties/server/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err118];
                                            } else {
                                              vErrors.push(err118);
                                            }
                                            errors++;
                                          }
                                          var valid33 = _errs201 === errors;
                                        } else {
                                          var valid33 = true;
                                        }
                                        if (valid33) {
                                          if (data.status !== void 0) {
                                            let data72 = data.status;
                                            const _errs203 = errors;
                                            if (typeof data72 !== "string") {
                                              const err119 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err119];
                                              } else {
                                                vErrors.push(err119);
                                              }
                                              errors++;
                                            }
                                            if (!(data72 === "inProgress" || data72 === "completed" || data72 === "failed")) {
                                              const err120 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema89.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err120];
                                              } else {
                                                vErrors.push(err120);
                                              }
                                              errors++;
                                            }
                                            var valid33 = _errs203 === errors;
                                          } else {
                                            var valid33 = true;
                                          }
                                          if (valid33) {
                                            if (data.tool !== void 0) {
                                              const _errs206 = errors;
                                              if (typeof data.tool !== "string") {
                                                const err121 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/8/properties/tool/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err121];
                                                } else {
                                                  vErrors.push(err121);
                                                }
                                                errors++;
                                              }
                                              var valid33 = _errs206 === errors;
                                            } else {
                                              var valid33 = true;
                                            }
                                            if (valid33) {
                                              if (data.type !== void 0) {
                                                let data74 = data.type;
                                                const _errs208 = errors;
                                                if (typeof data74 !== "string") {
                                                  const err122 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/type", keyword: "type", params: { type: "string" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err122];
                                                  } else {
                                                    vErrors.push(err122);
                                                  }
                                                  errors++;
                                                }
                                                if (!(data74 === "mcpToolCall")) {
                                                  const err123 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[8].properties.type.enum } };
                                                  if (vErrors === null) {
                                                    vErrors = [err123];
                                                  } else {
                                                    vErrors.push(err123);
                                                  }
                                                  errors++;
                                                }
                                                var valid33 = _errs208 === errors;
                                              } else {
                                                var valid33 = true;
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
                    const err124 = { instancePath, schemaPath: "#/oneOf/8/type", keyword: "type", params: { type: "object" } };
                    if (vErrors === null) {
                      vErrors = [err124];
                    } else {
                      vErrors.push(err124);
                    }
                    errors++;
                  }
                }
                var _valid0 = _errs149 === errors;
                if (_valid0 && valid0) {
                  valid0 = false;
                  passing0 = [passing0, 8];
                } else {
                  if (_valid0) {
                    valid0 = true;
                    passing0 = 8;
                  }
                  const _errs210 = errors;
                  if (errors === _errs210) {
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      let missing14;
                      if (data.arguments === void 0 && (missing14 = "arguments") || data.id === void 0 && (missing14 = "id") || data.status === void 0 && (missing14 = "status") || data.tool === void 0 && (missing14 = "tool") || data.type === void 0 && (missing14 = "type")) {
                        const err125 = { instancePath, schemaPath: "#/oneOf/9/required", keyword: "required", params: { missingProperty: missing14 } };
                        if (vErrors === null) {
                          vErrors = [err125];
                        } else {
                          vErrors.push(err125);
                        }
                        errors++;
                      } else {
                        if (data.contentItems !== void 0) {
                          let data75 = data.contentItems;
                          const _errs212 = errors;
                          if (!Array.isArray(data75) && data75 !== null) {
                            const err126 = { instancePath: instancePath + "/contentItems", schemaPath: "#/oneOf/9/properties/contentItems/type", keyword: "type", params: { type: schema61.oneOf[9].properties.contentItems.type } };
                            if (vErrors === null) {
                              vErrors = [err126];
                            } else {
                              vErrors.push(err126);
                            }
                            errors++;
                          }
                          if (errors === _errs212) {
                            if (Array.isArray(data75)) {
                              var valid46 = true;
                              const len8 = data75.length;
                              for (let i8 = 0; i8 < len8; i8++) {
                                let data76 = data75[i8];
                                const _errs214 = errors;
                                const _errs216 = errors;
                                let valid48 = false;
                                let passing2 = null;
                                const _errs217 = errors;
                                if (errors === _errs217) {
                                  if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                                    let missing15;
                                    if (data76.text === void 0 && (missing15 = "text") || data76.type === void 0 && (missing15 = "type")) {
                                      const err127 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/required", keyword: "required", params: { missingProperty: missing15 } };
                                      if (vErrors === null) {
                                        vErrors = [err127];
                                      } else {
                                        vErrors.push(err127);
                                      }
                                      errors++;
                                    } else {
                                      if (data76.text !== void 0) {
                                        const _errs219 = errors;
                                        if (typeof data76.text !== "string") {
                                          const err128 = { instancePath: instancePath + "/contentItems/" + i8 + "/text", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/text/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err128];
                                          } else {
                                            vErrors.push(err128);
                                          }
                                          errors++;
                                        }
                                        var valid49 = _errs219 === errors;
                                      } else {
                                        var valid49 = true;
                                      }
                                      if (valid49) {
                                        if (data76.type !== void 0) {
                                          let data78 = data76.type;
                                          const _errs221 = errors;
                                          if (typeof data78 !== "string") {
                                            const err129 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err129];
                                            } else {
                                              vErrors.push(err129);
                                            }
                                            errors++;
                                          }
                                          if (!(data78 === "inputText")) {
                                            const err130 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema90.oneOf[0].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err130];
                                            } else {
                                              vErrors.push(err130);
                                            }
                                            errors++;
                                          }
                                          var valid49 = _errs221 === errors;
                                        } else {
                                          var valid49 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err131 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err131];
                                    } else {
                                      vErrors.push(err131);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid9 = _errs217 === errors;
                                if (_valid9) {
                                  valid48 = true;
                                  passing2 = 0;
                                }
                                const _errs223 = errors;
                                if (errors === _errs223) {
                                  if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                                    let missing16;
                                    if (data76.imageUrl === void 0 && (missing16 = "imageUrl") || data76.type === void 0 && (missing16 = "type")) {
                                      const err132 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/required", keyword: "required", params: { missingProperty: missing16 } };
                                      if (vErrors === null) {
                                        vErrors = [err132];
                                      } else {
                                        vErrors.push(err132);
                                      }
                                      errors++;
                                    } else {
                                      if (data76.imageUrl !== void 0) {
                                        const _errs225 = errors;
                                        if (typeof data76.imageUrl !== "string") {
                                          const err133 = { instancePath: instancePath + "/contentItems/" + i8 + "/imageUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/imageUrl/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err133];
                                          } else {
                                            vErrors.push(err133);
                                          }
                                          errors++;
                                        }
                                        var valid50 = _errs225 === errors;
                                      } else {
                                        var valid50 = true;
                                      }
                                      if (valid50) {
                                        if (data76.type !== void 0) {
                                          let data80 = data76.type;
                                          const _errs227 = errors;
                                          if (typeof data80 !== "string") {
                                            const err134 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err134];
                                            } else {
                                              vErrors.push(err134);
                                            }
                                            errors++;
                                          }
                                          if (!(data80 === "inputImage")) {
                                            const err135 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema90.oneOf[1].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err135];
                                            } else {
                                              vErrors.push(err135);
                                            }
                                            errors++;
                                          }
                                          var valid50 = _errs227 === errors;
                                        } else {
                                          var valid50 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err136 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err136];
                                    } else {
                                      vErrors.push(err136);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid9 = _errs223 === errors;
                                if (_valid9 && valid48) {
                                  valid48 = false;
                                  passing2 = [passing2, 1];
                                } else {
                                  if (_valid9) {
                                    valid48 = true;
                                    passing2 = 1;
                                  }
                                  const _errs229 = errors;
                                  if (errors === _errs229) {
                                    if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                                      let missing17;
                                      if (data76.audioUrl === void 0 && (missing17 = "audioUrl") || data76.type === void 0 && (missing17 = "type")) {
                                        const err137 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/required", keyword: "required", params: { missingProperty: missing17 } };
                                        if (vErrors === null) {
                                          vErrors = [err137];
                                        } else {
                                          vErrors.push(err137);
                                        }
                                        errors++;
                                      } else {
                                        if (data76.audioUrl !== void 0) {
                                          const _errs231 = errors;
                                          if (typeof data76.audioUrl !== "string") {
                                            const err138 = { instancePath: instancePath + "/contentItems/" + i8 + "/audioUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/audioUrl/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err138];
                                            } else {
                                              vErrors.push(err138);
                                            }
                                            errors++;
                                          }
                                          var valid51 = _errs231 === errors;
                                        } else {
                                          var valid51 = true;
                                        }
                                        if (valid51) {
                                          if (data76.type !== void 0) {
                                            let data82 = data76.type;
                                            const _errs233 = errors;
                                            if (typeof data82 !== "string") {
                                              const err139 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err139];
                                              } else {
                                                vErrors.push(err139);
                                              }
                                              errors++;
                                            }
                                            if (!(data82 === "inputAudio")) {
                                              const err140 = { instancePath: instancePath + "/contentItems/" + i8 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema90.oneOf[2].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err140];
                                              } else {
                                                vErrors.push(err140);
                                              }
                                              errors++;
                                            }
                                            var valid51 = _errs233 === errors;
                                          } else {
                                            var valid51 = true;
                                          }
                                        }
                                      }
                                    } else {
                                      const err141 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err141];
                                      } else {
                                        vErrors.push(err141);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid9 = _errs229 === errors;
                                  if (_valid9 && valid48) {
                                    valid48 = false;
                                    passing2 = [passing2, 2];
                                  } else {
                                    if (_valid9) {
                                      valid48 = true;
                                      passing2 = 2;
                                    }
                                  }
                                }
                                if (!valid48) {
                                  const err142 = { instancePath: instancePath + "/contentItems/" + i8, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf", keyword: "oneOf", params: { passingSchemas: passing2 } };
                                  if (vErrors === null) {
                                    vErrors = [err142];
                                  } else {
                                    vErrors.push(err142);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs216;
                                  if (vErrors !== null) {
                                    if (_errs216) {
                                      vErrors.length = _errs216;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid46 = _errs214 === errors;
                                if (!valid46) {
                                  break;
                                }
                              }
                            }
                          }
                          var valid45 = _errs212 === errors;
                        } else {
                          var valid45 = true;
                        }
                        if (valid45) {
                          if (data.durationMs !== void 0) {
                            let data83 = data.durationMs;
                            const _errs235 = errors;
                            if (!(typeof data83 == "number" && (!(data83 % 1) && !isNaN(data83)) && isFinite(data83)) && data83 !== null) {
                              const err143 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/9/properties/durationMs/type", keyword: "type", params: { type: schema61.oneOf[9].properties.durationMs.type } };
                              if (vErrors === null) {
                                vErrors = [err143];
                              } else {
                                vErrors.push(err143);
                              }
                              errors++;
                            }
                            var valid45 = _errs235 === errors;
                          } else {
                            var valid45 = true;
                          }
                          if (valid45) {
                            if (data.id !== void 0) {
                              const _errs237 = errors;
                              if (typeof data.id !== "string") {
                                const err144 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/9/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err144];
                                } else {
                                  vErrors.push(err144);
                                }
                                errors++;
                              }
                              var valid45 = _errs237 === errors;
                            } else {
                              var valid45 = true;
                            }
                            if (valid45) {
                              if (data.namespace !== void 0) {
                                let data85 = data.namespace;
                                const _errs239 = errors;
                                if (typeof data85 !== "string" && data85 !== null) {
                                  const err145 = { instancePath: instancePath + "/namespace", schemaPath: "#/oneOf/9/properties/namespace/type", keyword: "type", params: { type: schema61.oneOf[9].properties.namespace.type } };
                                  if (vErrors === null) {
                                    vErrors = [err145];
                                  } else {
                                    vErrors.push(err145);
                                  }
                                  errors++;
                                }
                                var valid45 = _errs239 === errors;
                              } else {
                                var valid45 = true;
                              }
                              if (valid45) {
                                if (data.status !== void 0) {
                                  let data86 = data.status;
                                  const _errs241 = errors;
                                  if (typeof data86 !== "string") {
                                    const err146 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err146];
                                    } else {
                                      vErrors.push(err146);
                                    }
                                    errors++;
                                  }
                                  if (!(data86 === "inProgress" || data86 === "completed" || data86 === "failed")) {
                                    const err147 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema91.enum } };
                                    if (vErrors === null) {
                                      vErrors = [err147];
                                    } else {
                                      vErrors.push(err147);
                                    }
                                    errors++;
                                  }
                                  var valid45 = _errs241 === errors;
                                } else {
                                  var valid45 = true;
                                }
                                if (valid45) {
                                  if (data.success !== void 0) {
                                    let data87 = data.success;
                                    const _errs244 = errors;
                                    if (typeof data87 !== "boolean" && data87 !== null) {
                                      const err148 = { instancePath: instancePath + "/success", schemaPath: "#/oneOf/9/properties/success/type", keyword: "type", params: { type: schema61.oneOf[9].properties.success.type } };
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
                                    if (data.tool !== void 0) {
                                      const _errs246 = errors;
                                      if (typeof data.tool !== "string") {
                                        const err149 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/9/properties/tool/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err149];
                                        } else {
                                          vErrors.push(err149);
                                        }
                                        errors++;
                                      }
                                      var valid45 = _errs246 === errors;
                                    } else {
                                      var valid45 = true;
                                    }
                                    if (valid45) {
                                      if (data.type !== void 0) {
                                        let data89 = data.type;
                                        const _errs248 = errors;
                                        if (typeof data89 !== "string") {
                                          const err150 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err150];
                                          } else {
                                            vErrors.push(err150);
                                          }
                                          errors++;
                                        }
                                        if (!(data89 === "dynamicToolCall")) {
                                          const err151 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[9].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err151];
                                          } else {
                                            vErrors.push(err151);
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
                    } else {
                      const err152 = { instancePath, schemaPath: "#/oneOf/9/type", keyword: "type", params: { type: "object" } };
                      if (vErrors === null) {
                        vErrors = [err152];
                      } else {
                        vErrors.push(err152);
                      }
                      errors++;
                    }
                  }
                  var _valid0 = _errs210 === errors;
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
                        let missing18;
                        if (data.agentsStates === void 0 && (missing18 = "agentsStates") || data.id === void 0 && (missing18 = "id") || data.receiverThreadIds === void 0 && (missing18 = "receiverThreadIds") || data.senderThreadId === void 0 && (missing18 = "senderThreadId") || data.status === void 0 && (missing18 = "status") || data.tool === void 0 && (missing18 = "tool") || data.type === void 0 && (missing18 = "type")) {
                          const err153 = { instancePath, schemaPath: "#/oneOf/10/required", keyword: "required", params: { missingProperty: missing18 } };
                          if (vErrors === null) {
                            vErrors = [err153];
                          } else {
                            vErrors.push(err153);
                          }
                          errors++;
                        } else {
                          if (data.agentsStates !== void 0) {
                            let data90 = data.agentsStates;
                            const _errs252 = errors;
                            if (errors === _errs252) {
                              if (data90 && typeof data90 == "object" && !Array.isArray(data90)) {
                                for (const key1 in data90) {
                                  const _errs255 = errors;
                                  if (!validate64(data90[key1], { instancePath: instancePath + "/agentsStates/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data90, parentDataProperty: key1, rootData })) {
                                    vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid54 = _errs255 === errors;
                                  if (!valid54) {
                                    break;
                                  }
                                }
                              } else {
                                const err154 = { instancePath: instancePath + "/agentsStates", schemaPath: "#/oneOf/10/properties/agentsStates/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err154];
                                } else {
                                  vErrors.push(err154);
                                }
                                errors++;
                              }
                            }
                            var valid53 = _errs252 === errors;
                          } else {
                            var valid53 = true;
                          }
                          if (valid53) {
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
                              var valid53 = _errs256 === errors;
                            } else {
                              var valid53 = true;
                            }
                            if (valid53) {
                              if (data.model !== void 0) {
                                let data93 = data.model;
                                const _errs258 = errors;
                                if (typeof data93 !== "string" && data93 !== null) {
                                  const err156 = { instancePath: instancePath + "/model", schemaPath: "#/oneOf/10/properties/model/type", keyword: "type", params: { type: schema61.oneOf[10].properties.model.type } };
                                  if (vErrors === null) {
                                    vErrors = [err156];
                                  } else {
                                    vErrors.push(err156);
                                  }
                                  errors++;
                                }
                                var valid53 = _errs258 === errors;
                              } else {
                                var valid53 = true;
                              }
                              if (valid53) {
                                if (data.prompt !== void 0) {
                                  let data94 = data.prompt;
                                  const _errs260 = errors;
                                  if (typeof data94 !== "string" && data94 !== null) {
                                    const err157 = { instancePath: instancePath + "/prompt", schemaPath: "#/oneOf/10/properties/prompt/type", keyword: "type", params: { type: schema61.oneOf[10].properties.prompt.type } };
                                    if (vErrors === null) {
                                      vErrors = [err157];
                                    } else {
                                      vErrors.push(err157);
                                    }
                                    errors++;
                                  }
                                  var valid53 = _errs260 === errors;
                                } else {
                                  var valid53 = true;
                                }
                                if (valid53) {
                                  if (data.reasoningEffort !== void 0) {
                                    let data95 = data.reasoningEffort;
                                    const _errs262 = errors;
                                    const _errs263 = errors;
                                    let valid55 = false;
                                    const _errs264 = errors;
                                    const _errs265 = errors;
                                    if (errors === _errs265) {
                                      if (typeof data95 === "string") {
                                        if (func2(data95) < 1) {
                                          const err158 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                                          if (vErrors === null) {
                                            vErrors = [err158];
                                          } else {
                                            vErrors.push(err158);
                                          }
                                          errors++;
                                        }
                                      } else {
                                        const err159 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err159];
                                        } else {
                                          vErrors.push(err159);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid10 = _errs264 === errors;
                                    valid55 = valid55 || _valid10;
                                    if (!valid55) {
                                      const _errs267 = errors;
                                      if (data95 !== null) {
                                        const err160 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/10/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                        if (vErrors === null) {
                                          vErrors = [err160];
                                        } else {
                                          vErrors.push(err160);
                                        }
                                        errors++;
                                      }
                                      var _valid10 = _errs267 === errors;
                                      valid55 = valid55 || _valid10;
                                    }
                                    if (!valid55) {
                                      const err161 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/10/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                                      if (vErrors === null) {
                                        vErrors = [err161];
                                      } else {
                                        vErrors.push(err161);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs263;
                                      if (vErrors !== null) {
                                        if (_errs263) {
                                          vErrors.length = _errs263;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid53 = _errs262 === errors;
                                  } else {
                                    var valid53 = true;
                                  }
                                  if (valid53) {
                                    if (data.receiverThreadIds !== void 0) {
                                      let data96 = data.receiverThreadIds;
                                      const _errs269 = errors;
                                      if (errors === _errs269) {
                                        if (Array.isArray(data96)) {
                                          var valid57 = true;
                                          const len9 = data96.length;
                                          for (let i9 = 0; i9 < len9; i9++) {
                                            const _errs271 = errors;
                                            if (typeof data96[i9] !== "string") {
                                              const err162 = { instancePath: instancePath + "/receiverThreadIds/" + i9, schemaPath: "#/oneOf/10/properties/receiverThreadIds/items/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err162];
                                              } else {
                                                vErrors.push(err162);
                                              }
                                              errors++;
                                            }
                                            var valid57 = _errs271 === errors;
                                            if (!valid57) {
                                              break;
                                            }
                                          }
                                        } else {
                                          const err163 = { instancePath: instancePath + "/receiverThreadIds", schemaPath: "#/oneOf/10/properties/receiverThreadIds/type", keyword: "type", params: { type: "array" } };
                                          if (vErrors === null) {
                                            vErrors = [err163];
                                          } else {
                                            vErrors.push(err163);
                                          }
                                          errors++;
                                        }
                                      }
                                      var valid53 = _errs269 === errors;
                                    } else {
                                      var valid53 = true;
                                    }
                                    if (valid53) {
                                      if (data.senderThreadId !== void 0) {
                                        const _errs273 = errors;
                                        if (typeof data.senderThreadId !== "string") {
                                          const err164 = { instancePath: instancePath + "/senderThreadId", schemaPath: "#/oneOf/10/properties/senderThreadId/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err164];
                                          } else {
                                            vErrors.push(err164);
                                          }
                                          errors++;
                                        }
                                        var valid53 = _errs273 === errors;
                                      } else {
                                        var valid53 = true;
                                      }
                                      if (valid53) {
                                        if (data.status !== void 0) {
                                          let data99 = data.status;
                                          const _errs275 = errors;
                                          if (typeof data99 !== "string") {
                                            const err165 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err165];
                                            } else {
                                              vErrors.push(err165);
                                            }
                                            errors++;
                                          }
                                          if (!(data99 === "inProgress" || data99 === "completed" || data99 === "failed" || data99 === "interrupted")) {
                                            const err166 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema95.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err166];
                                            } else {
                                              vErrors.push(err166);
                                            }
                                            errors++;
                                          }
                                          var valid53 = _errs275 === errors;
                                        } else {
                                          var valid53 = true;
                                        }
                                        if (valid53) {
                                          if (data.tool !== void 0) {
                                            let data100 = data.tool;
                                            const _errs279 = errors;
                                            if (typeof data100 !== "string") {
                                              const err167 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err167];
                                              } else {
                                                vErrors.push(err167);
                                              }
                                              errors++;
                                            }
                                            if (!(data100 === "spawnAgent" || data100 === "sendInput" || data100 === "resumeAgent" || data100 === "wait" || data100 === "closeAgent" || data100 === "sendMessage" || data100 === "followupTask" || data100 === "interruptAgent" || data100 === "listAgents")) {
                                              const err168 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/enum", keyword: "enum", params: { allowedValues: schema96.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err168];
                                              } else {
                                                vErrors.push(err168);
                                              }
                                              errors++;
                                            }
                                            var valid53 = _errs279 === errors;
                                          } else {
                                            var valid53 = true;
                                          }
                                          if (valid53) {
                                            if (data.type !== void 0) {
                                              let data101 = data.type;
                                              const _errs283 = errors;
                                              if (typeof data101 !== "string") {
                                                const err169 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err169];
                                                } else {
                                                  vErrors.push(err169);
                                                }
                                                errors++;
                                              }
                                              if (!(data101 === "collabAgentToolCall")) {
                                                const err170 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[10].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err170];
                                                } else {
                                                  vErrors.push(err170);
                                                }
                                                errors++;
                                              }
                                              var valid53 = _errs283 === errors;
                                            } else {
                                              var valid53 = true;
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
                        const err171 = { instancePath, schemaPath: "#/oneOf/10/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err171];
                        } else {
                          vErrors.push(err171);
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
                      const _errs285 = errors;
                      if (errors === _errs285) {
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          let missing19;
                          if (data.agentPath === void 0 && (missing19 = "agentPath") || data.agentThreadId === void 0 && (missing19 = "agentThreadId") || data.id === void 0 && (missing19 = "id") || data.kind === void 0 && (missing19 = "kind") || data.type === void 0 && (missing19 = "type")) {
                            const err172 = { instancePath, schemaPath: "#/oneOf/11/required", keyword: "required", params: { missingProperty: missing19 } };
                            if (vErrors === null) {
                              vErrors = [err172];
                            } else {
                              vErrors.push(err172);
                            }
                            errors++;
                          } else {
                            if (data.agentPath !== void 0) {
                              const _errs287 = errors;
                              if (typeof data.agentPath !== "string") {
                                const err173 = { instancePath: instancePath + "/agentPath", schemaPath: "#/oneOf/11/properties/agentPath/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err173];
                                } else {
                                  vErrors.push(err173);
                                }
                                errors++;
                              }
                              var valid62 = _errs287 === errors;
                            } else {
                              var valid62 = true;
                            }
                            if (valid62) {
                              if (data.agentThreadId !== void 0) {
                                const _errs289 = errors;
                                if (typeof data.agentThreadId !== "string") {
                                  const err174 = { instancePath: instancePath + "/agentThreadId", schemaPath: "#/oneOf/11/properties/agentThreadId/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err174];
                                  } else {
                                    vErrors.push(err174);
                                  }
                                  errors++;
                                }
                                var valid62 = _errs289 === errors;
                              } else {
                                var valid62 = true;
                              }
                              if (valid62) {
                                if (data.id !== void 0) {
                                  const _errs291 = errors;
                                  if (typeof data.id !== "string") {
                                    const err175 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/11/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err175];
                                    } else {
                                      vErrors.push(err175);
                                    }
                                    errors++;
                                  }
                                  var valid62 = _errs291 === errors;
                                } else {
                                  var valid62 = true;
                                }
                                if (valid62) {
                                  if (data.kind !== void 0) {
                                    let data105 = data.kind;
                                    const _errs293 = errors;
                                    if (typeof data105 !== "string") {
                                      const err176 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err176];
                                      } else {
                                        vErrors.push(err176);
                                      }
                                      errors++;
                                    }
                                    if (!(data105 === "started" || data105 === "interacted" || data105 === "interrupted" || data105 === "completed")) {
                                      const err177 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/enum", keyword: "enum", params: { allowedValues: schema97.enum } };
                                      if (vErrors === null) {
                                        vErrors = [err177];
                                      } else {
                                        vErrors.push(err177);
                                      }
                                      errors++;
                                    }
                                    var valid62 = _errs293 === errors;
                                  } else {
                                    var valid62 = true;
                                  }
                                  if (valid62) {
                                    if (data.type !== void 0) {
                                      let data106 = data.type;
                                      const _errs296 = errors;
                                      if (typeof data106 !== "string") {
                                        const err178 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err178];
                                        } else {
                                          vErrors.push(err178);
                                        }
                                        errors++;
                                      }
                                      if (!(data106 === "subAgentActivity")) {
                                        const err179 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[11].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err179];
                                        } else {
                                          vErrors.push(err179);
                                        }
                                        errors++;
                                      }
                                      var valid62 = _errs296 === errors;
                                    } else {
                                      var valid62 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          const err180 = { instancePath, schemaPath: "#/oneOf/11/type", keyword: "type", params: { type: "object" } };
                          if (vErrors === null) {
                            vErrors = [err180];
                          } else {
                            vErrors.push(err180);
                          }
                          errors++;
                        }
                      }
                      var _valid0 = _errs285 === errors;
                      if (_valid0 && valid0) {
                        valid0 = false;
                        passing0 = [passing0, 11];
                      } else {
                        if (_valid0) {
                          valid0 = true;
                          passing0 = 11;
                        }
                        const _errs298 = errors;
                        if (errors === _errs298) {
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            let missing20;
                            if (data.id === void 0 && (missing20 = "id") || data.query === void 0 && (missing20 = "query") || data.type === void 0 && (missing20 = "type")) {
                              const err181 = { instancePath, schemaPath: "#/oneOf/12/required", keyword: "required", params: { missingProperty: missing20 } };
                              if (vErrors === null) {
                                vErrors = [err181];
                              } else {
                                vErrors.push(err181);
                              }
                              errors++;
                            } else {
                              if (data.action !== void 0) {
                                let data107 = data.action;
                                const _errs300 = errors;
                                const _errs301 = errors;
                                let valid65 = false;
                                const _errs302 = errors;
                                const _errs304 = errors;
                                let valid67 = false;
                                let passing3 = null;
                                const _errs305 = errors;
                                if (errors === _errs305) {
                                  if (data107 && typeof data107 == "object" && !Array.isArray(data107)) {
                                    let missing21;
                                    if (data107.type === void 0 && (missing21 = "type")) {
                                      const err182 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/required", keyword: "required", params: { missingProperty: missing21 } };
                                      if (vErrors === null) {
                                        vErrors = [err182];
                                      } else {
                                        vErrors.push(err182);
                                      }
                                      errors++;
                                    } else {
                                      if (data107.queries !== void 0) {
                                        let data108 = data107.queries;
                                        const _errs307 = errors;
                                        if (!Array.isArray(data108) && data108 !== null) {
                                          const err183 = { instancePath: instancePath + "/action/queries", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/type", keyword: "type", params: { type: schema98.oneOf[0].properties.queries.type } };
                                          if (vErrors === null) {
                                            vErrors = [err183];
                                          } else {
                                            vErrors.push(err183);
                                          }
                                          errors++;
                                        }
                                        if (errors === _errs307) {
                                          if (Array.isArray(data108)) {
                                            var valid69 = true;
                                            const len10 = data108.length;
                                            for (let i10 = 0; i10 < len10; i10++) {
                                              const _errs309 = errors;
                                              if (typeof data108[i10] !== "string") {
                                                const err184 = { instancePath: instancePath + "/action/queries/" + i10, schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/items/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err184];
                                                } else {
                                                  vErrors.push(err184);
                                                }
                                                errors++;
                                              }
                                              var valid69 = _errs309 === errors;
                                              if (!valid69) {
                                                break;
                                              }
                                            }
                                          }
                                        }
                                        var valid68 = _errs307 === errors;
                                      } else {
                                        var valid68 = true;
                                      }
                                      if (valid68) {
                                        if (data107.query !== void 0) {
                                          let data110 = data107.query;
                                          const _errs311 = errors;
                                          if (typeof data110 !== "string" && data110 !== null) {
                                            const err185 = { instancePath: instancePath + "/action/query", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/query/type", keyword: "type", params: { type: schema98.oneOf[0].properties.query.type } };
                                            if (vErrors === null) {
                                              vErrors = [err185];
                                            } else {
                                              vErrors.push(err185);
                                            }
                                            errors++;
                                          }
                                          var valid68 = _errs311 === errors;
                                        } else {
                                          var valid68 = true;
                                        }
                                        if (valid68) {
                                          if (data107.type !== void 0) {
                                            let data111 = data107.type;
                                            const _errs313 = errors;
                                            if (typeof data111 !== "string") {
                                              const err186 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err186];
                                              } else {
                                                vErrors.push(err186);
                                              }
                                              errors++;
                                            }
                                            if (!(data111 === "search")) {
                                              const err187 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema98.oneOf[0].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err187];
                                              } else {
                                                vErrors.push(err187);
                                              }
                                              errors++;
                                            }
                                            var valid68 = _errs313 === errors;
                                          } else {
                                            var valid68 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err188 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err188];
                                    } else {
                                      vErrors.push(err188);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid12 = _errs305 === errors;
                                if (_valid12) {
                                  valid67 = true;
                                  passing3 = 0;
                                }
                                const _errs315 = errors;
                                if (errors === _errs315) {
                                  if (data107 && typeof data107 == "object" && !Array.isArray(data107)) {
                                    let missing22;
                                    if (data107.type === void 0 && (missing22 = "type")) {
                                      const err189 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/required", keyword: "required", params: { missingProperty: missing22 } };
                                      if (vErrors === null) {
                                        vErrors = [err189];
                                      } else {
                                        vErrors.push(err189);
                                      }
                                      errors++;
                                    } else {
                                      if (data107.type !== void 0) {
                                        let data112 = data107.type;
                                        const _errs317 = errors;
                                        if (typeof data112 !== "string") {
                                          const err190 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err190];
                                          } else {
                                            vErrors.push(err190);
                                          }
                                          errors++;
                                        }
                                        if (!(data112 === "openPage")) {
                                          const err191 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema98.oneOf[1].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err191];
                                          } else {
                                            vErrors.push(err191);
                                          }
                                          errors++;
                                        }
                                        var valid70 = _errs317 === errors;
                                      } else {
                                        var valid70 = true;
                                      }
                                      if (valid70) {
                                        if (data107.url !== void 0) {
                                          let data113 = data107.url;
                                          const _errs319 = errors;
                                          if (typeof data113 !== "string" && data113 !== null) {
                                            const err192 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/url/type", keyword: "type", params: { type: schema98.oneOf[1].properties.url.type } };
                                            if (vErrors === null) {
                                              vErrors = [err192];
                                            } else {
                                              vErrors.push(err192);
                                            }
                                            errors++;
                                          }
                                          var valid70 = _errs319 === errors;
                                        } else {
                                          var valid70 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err193 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err193];
                                    } else {
                                      vErrors.push(err193);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid12 = _errs315 === errors;
                                if (_valid12 && valid67) {
                                  valid67 = false;
                                  passing3 = [passing3, 1];
                                } else {
                                  if (_valid12) {
                                    valid67 = true;
                                    passing3 = 1;
                                  }
                                  const _errs321 = errors;
                                  if (errors === _errs321) {
                                    if (data107 && typeof data107 == "object" && !Array.isArray(data107)) {
                                      let missing23;
                                      if (data107.type === void 0 && (missing23 = "type")) {
                                        const err194 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/required", keyword: "required", params: { missingProperty: missing23 } };
                                        if (vErrors === null) {
                                          vErrors = [err194];
                                        } else {
                                          vErrors.push(err194);
                                        }
                                        errors++;
                                      } else {
                                        if (data107.pattern !== void 0) {
                                          let data114 = data107.pattern;
                                          const _errs323 = errors;
                                          if (typeof data114 !== "string" && data114 !== null) {
                                            const err195 = { instancePath: instancePath + "/action/pattern", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/pattern/type", keyword: "type", params: { type: schema98.oneOf[2].properties.pattern.type } };
                                            if (vErrors === null) {
                                              vErrors = [err195];
                                            } else {
                                              vErrors.push(err195);
                                            }
                                            errors++;
                                          }
                                          var valid71 = _errs323 === errors;
                                        } else {
                                          var valid71 = true;
                                        }
                                        if (valid71) {
                                          if (data107.type !== void 0) {
                                            let data115 = data107.type;
                                            const _errs325 = errors;
                                            if (typeof data115 !== "string") {
                                              const err196 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err196];
                                              } else {
                                                vErrors.push(err196);
                                              }
                                              errors++;
                                            }
                                            if (!(data115 === "findInPage")) {
                                              const err197 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema98.oneOf[2].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err197];
                                              } else {
                                                vErrors.push(err197);
                                              }
                                              errors++;
                                            }
                                            var valid71 = _errs325 === errors;
                                          } else {
                                            var valid71 = true;
                                          }
                                          if (valid71) {
                                            if (data107.url !== void 0) {
                                              let data116 = data107.url;
                                              const _errs327 = errors;
                                              if (typeof data116 !== "string" && data116 !== null) {
                                                const err198 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/url/type", keyword: "type", params: { type: schema98.oneOf[2].properties.url.type } };
                                                if (vErrors === null) {
                                                  vErrors = [err198];
                                                } else {
                                                  vErrors.push(err198);
                                                }
                                                errors++;
                                              }
                                              var valid71 = _errs327 === errors;
                                            } else {
                                              var valid71 = true;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err199 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err199];
                                      } else {
                                        vErrors.push(err199);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid12 = _errs321 === errors;
                                  if (_valid12 && valid67) {
                                    valid67 = false;
                                    passing3 = [passing3, 2];
                                  } else {
                                    if (_valid12) {
                                      valid67 = true;
                                      passing3 = 2;
                                    }
                                    const _errs329 = errors;
                                    if (errors === _errs329) {
                                      if (data107 && typeof data107 == "object" && !Array.isArray(data107)) {
                                        let missing24;
                                        if (data107.type === void 0 && (missing24 = "type")) {
                                          const err200 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/required", keyword: "required", params: { missingProperty: missing24 } };
                                          if (vErrors === null) {
                                            vErrors = [err200];
                                          } else {
                                            vErrors.push(err200);
                                          }
                                          errors++;
                                        } else {
                                          if (data107.type !== void 0) {
                                            let data117 = data107.type;
                                            if (typeof data117 !== "string") {
                                              const err201 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err201];
                                              } else {
                                                vErrors.push(err201);
                                              }
                                              errors++;
                                            }
                                            if (!(data117 === "other")) {
                                              const err202 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema98.oneOf[3].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err202];
                                              } else {
                                                vErrors.push(err202);
                                              }
                                              errors++;
                                            }
                                          }
                                        }
                                      } else {
                                        const err203 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err203];
                                        } else {
                                          vErrors.push(err203);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid12 = _errs329 === errors;
                                    if (_valid12 && valid67) {
                                      valid67 = false;
                                      passing3 = [passing3, 3];
                                    } else {
                                      if (_valid12) {
                                        valid67 = true;
                                        passing3 = 3;
                                      }
                                    }
                                  }
                                }
                                if (!valid67) {
                                  const err204 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf", keyword: "oneOf", params: { passingSchemas: passing3 } };
                                  if (vErrors === null) {
                                    vErrors = [err204];
                                  } else {
                                    vErrors.push(err204);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs304;
                                  if (vErrors !== null) {
                                    if (_errs304) {
                                      vErrors.length = _errs304;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var _valid11 = _errs302 === errors;
                                valid65 = valid65 || _valid11;
                                if (!valid65) {
                                  const _errs333 = errors;
                                  if (data107 !== null) {
                                    const err205 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/12/properties/action/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                    if (vErrors === null) {
                                      vErrors = [err205];
                                    } else {
                                      vErrors.push(err205);
                                    }
                                    errors++;
                                  }
                                  var _valid11 = _errs333 === errors;
                                  valid65 = valid65 || _valid11;
                                }
                                if (!valid65) {
                                  const err206 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/12/properties/action/anyOf", keyword: "anyOf", params: {} };
                                  if (vErrors === null) {
                                    vErrors = [err206];
                                  } else {
                                    vErrors.push(err206);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs301;
                                  if (vErrors !== null) {
                                    if (_errs301) {
                                      vErrors.length = _errs301;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid64 = _errs300 === errors;
                              } else {
                                var valid64 = true;
                              }
                              if (valid64) {
                                if (data.id !== void 0) {
                                  const _errs335 = errors;
                                  if (typeof data.id !== "string") {
                                    const err207 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/12/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err207];
                                    } else {
                                      vErrors.push(err207);
                                    }
                                    errors++;
                                  }
                                  var valid64 = _errs335 === errors;
                                } else {
                                  var valid64 = true;
                                }
                                if (valid64) {
                                  if (data.query !== void 0) {
                                    const _errs337 = errors;
                                    if (typeof data.query !== "string") {
                                      const err208 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/12/properties/query/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err208];
                                      } else {
                                        vErrors.push(err208);
                                      }
                                      errors++;
                                    }
                                    var valid64 = _errs337 === errors;
                                  } else {
                                    var valid64 = true;
                                  }
                                  if (valid64) {
                                    if (data.results !== void 0) {
                                      let data120 = data.results;
                                      const _errs339 = errors;
                                      if (!Array.isArray(data120) && data120 !== null) {
                                        const err209 = { instancePath: instancePath + "/results", schemaPath: "#/oneOf/12/properties/results/type", keyword: "type", params: { type: schema61.oneOf[12].properties.results.type } };
                                        if (vErrors === null) {
                                          vErrors = [err209];
                                        } else {
                                          vErrors.push(err209);
                                        }
                                        errors++;
                                      }
                                      var valid64 = _errs339 === errors;
                                    } else {
                                      var valid64 = true;
                                    }
                                    if (valid64) {
                                      if (data.type !== void 0) {
                                        let data121 = data.type;
                                        const _errs341 = errors;
                                        if (typeof data121 !== "string") {
                                          const err210 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err210];
                                          } else {
                                            vErrors.push(err210);
                                          }
                                          errors++;
                                        }
                                        if (!(data121 === "webSearch")) {
                                          const err211 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[12].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err211];
                                          } else {
                                            vErrors.push(err211);
                                          }
                                          errors++;
                                        }
                                        var valid64 = _errs341 === errors;
                                      } else {
                                        var valid64 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            const err212 = { instancePath, schemaPath: "#/oneOf/12/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err212];
                            } else {
                              vErrors.push(err212);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs298 === errors;
                        if (_valid0 && valid0) {
                          valid0 = false;
                          passing0 = [passing0, 12];
                        } else {
                          if (_valid0) {
                            valid0 = true;
                            passing0 = 12;
                          }
                          const _errs343 = errors;
                          if (errors === _errs343) {
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              let missing25;
                              if (data.id === void 0 && (missing25 = "id") || data.path === void 0 && (missing25 = "path") || data.type === void 0 && (missing25 = "type")) {
                                const err213 = { instancePath, schemaPath: "#/oneOf/13/required", keyword: "required", params: { missingProperty: missing25 } };
                                if (vErrors === null) {
                                  vErrors = [err213];
                                } else {
                                  vErrors.push(err213);
                                }
                                errors++;
                              } else {
                                if (data.id !== void 0) {
                                  const _errs345 = errors;
                                  if (typeof data.id !== "string") {
                                    const err214 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/13/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err214];
                                    } else {
                                      vErrors.push(err214);
                                    }
                                    errors++;
                                  }
                                  var valid73 = _errs345 === errors;
                                } else {
                                  var valid73 = true;
                                }
                                if (valid73) {
                                  if (data.path !== void 0) {
                                    const _errs347 = errors;
                                    if (typeof data.path !== "string") {
                                      const err215 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err215];
                                      } else {
                                        vErrors.push(err215);
                                      }
                                      errors++;
                                    }
                                    var valid73 = _errs347 === errors;
                                  } else {
                                    var valid73 = true;
                                  }
                                  if (valid73) {
                                    if (data.type !== void 0) {
                                      let data124 = data.type;
                                      const _errs350 = errors;
                                      if (typeof data124 !== "string") {
                                        const err216 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err216];
                                        } else {
                                          vErrors.push(err216);
                                        }
                                        errors++;
                                      }
                                      if (!(data124 === "imageView")) {
                                        const err217 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[13].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err217];
                                        } else {
                                          vErrors.push(err217);
                                        }
                                        errors++;
                                      }
                                      var valid73 = _errs350 === errors;
                                    } else {
                                      var valid73 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err218 = { instancePath, schemaPath: "#/oneOf/13/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err218];
                              } else {
                                vErrors.push(err218);
                              }
                              errors++;
                            }
                          }
                          var _valid0 = _errs343 === errors;
                          if (_valid0 && valid0) {
                            valid0 = false;
                            passing0 = [passing0, 13];
                          } else {
                            if (_valid0) {
                              valid0 = true;
                              passing0 = 13;
                            }
                            const _errs352 = errors;
                            if (errors === _errs352) {
                              if (data && typeof data == "object" && !Array.isArray(data)) {
                                let missing26;
                                if (data.durationMs === void 0 && (missing26 = "durationMs") || data.id === void 0 && (missing26 = "id") || data.type === void 0 && (missing26 = "type")) {
                                  const err219 = { instancePath, schemaPath: "#/oneOf/14/required", keyword: "required", params: { missingProperty: missing26 } };
                                  if (vErrors === null) {
                                    vErrors = [err219];
                                  } else {
                                    vErrors.push(err219);
                                  }
                                  errors++;
                                } else {
                                  if (data.durationMs !== void 0) {
                                    let data125 = data.durationMs;
                                    const _errs354 = errors;
                                    if (!(typeof data125 == "number" && (!(data125 % 1) && !isNaN(data125)) && isFinite(data125))) {
                                      const err220 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/14/properties/durationMs/type", keyword: "type", params: { type: "integer" } };
                                      if (vErrors === null) {
                                        vErrors = [err220];
                                      } else {
                                        vErrors.push(err220);
                                      }
                                      errors++;
                                    }
                                    if (errors === _errs354) {
                                      if (typeof data125 == "number" && isFinite(data125)) {
                                        if (data125 < 0 || isNaN(data125)) {
                                          const err221 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/14/properties/durationMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                                          if (vErrors === null) {
                                            vErrors = [err221];
                                          } else {
                                            vErrors.push(err221);
                                          }
                                          errors++;
                                        }
                                      }
                                    }
                                    var valid75 = _errs354 === errors;
                                  } else {
                                    var valid75 = true;
                                  }
                                  if (valid75) {
                                    if (data.id !== void 0) {
                                      const _errs356 = errors;
                                      if (typeof data.id !== "string") {
                                        const err222 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/14/properties/id/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err222];
                                        } else {
                                          vErrors.push(err222);
                                        }
                                        errors++;
                                      }
                                      var valid75 = _errs356 === errors;
                                    } else {
                                      var valid75 = true;
                                    }
                                    if (valid75) {
                                      if (data.type !== void 0) {
                                        let data127 = data.type;
                                        const _errs358 = errors;
                                        if (typeof data127 !== "string") {
                                          const err223 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err223];
                                          } else {
                                            vErrors.push(err223);
                                          }
                                          errors++;
                                        }
                                        if (!(data127 === "sleep")) {
                                          const err224 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[14].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err224];
                                          } else {
                                            vErrors.push(err224);
                                          }
                                          errors++;
                                        }
                                        var valid75 = _errs358 === errors;
                                      } else {
                                        var valid75 = true;
                                      }
                                    }
                                  }
                                }
                              } else {
                                const err225 = { instancePath, schemaPath: "#/oneOf/14/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err225];
                                } else {
                                  vErrors.push(err225);
                                }
                                errors++;
                              }
                            }
                            var _valid0 = _errs352 === errors;
                            if (_valid0 && valid0) {
                              valid0 = false;
                              passing0 = [passing0, 14];
                            } else {
                              if (_valid0) {
                                valid0 = true;
                                passing0 = 14;
                              }
                              const _errs360 = errors;
                              if (errors === _errs360) {
                                if (data && typeof data == "object" && !Array.isArray(data)) {
                                  let missing27;
                                  if (data.id === void 0 && (missing27 = "id") || data.result === void 0 && (missing27 = "result") || data.status === void 0 && (missing27 = "status") || data.type === void 0 && (missing27 = "type")) {
                                    const err226 = { instancePath, schemaPath: "#/oneOf/15/required", keyword: "required", params: { missingProperty: missing27 } };
                                    if (vErrors === null) {
                                      vErrors = [err226];
                                    } else {
                                      vErrors.push(err226);
                                    }
                                    errors++;
                                  } else {
                                    if (data.failure !== void 0) {
                                      let data128 = data.failure;
                                      const _errs362 = errors;
                                      const _errs363 = errors;
                                      let valid77 = false;
                                      const _errs364 = errors;
                                      const _errs366 = errors;
                                      let valid79 = false;
                                      let passing4 = null;
                                      const _errs367 = errors;
                                      if (errors === _errs367) {
                                        if (data128 && typeof data128 == "object" && !Array.isArray(data128)) {
                                          let missing28;
                                          if (data128.limitId === void 0 && (missing28 = "limitId") || data128.type === void 0 && (missing28 = "type")) {
                                            const err227 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/required", keyword: "required", params: { missingProperty: missing28 } };
                                            if (vErrors === null) {
                                              vErrors = [err227];
                                            } else {
                                              vErrors.push(err227);
                                            }
                                            errors++;
                                          } else {
                                            if (data128.limitId !== void 0) {
                                              const _errs369 = errors;
                                              if (typeof data128.limitId !== "string") {
                                                const err228 = { instancePath: instancePath + "/failure/limitId", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/limitId/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err228];
                                                } else {
                                                  vErrors.push(err228);
                                                }
                                                errors++;
                                              }
                                              var valid80 = _errs369 === errors;
                                            } else {
                                              var valid80 = true;
                                            }
                                            if (valid80) {
                                              if (data128.resetsAt !== void 0) {
                                                let data130 = data128.resetsAt;
                                                const _errs371 = errors;
                                                if (!(typeof data130 == "number" && (!(data130 % 1) && !isNaN(data130)) && isFinite(data130)) && data130 !== null) {
                                                  const err229 = { instancePath: instancePath + "/failure/resetsAt", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/resetsAt/type", keyword: "type", params: { type: schema100.oneOf[0].properties.resetsAt.type } };
                                                  if (vErrors === null) {
                                                    vErrors = [err229];
                                                  } else {
                                                    vErrors.push(err229);
                                                  }
                                                  errors++;
                                                }
                                                var valid80 = _errs371 === errors;
                                              } else {
                                                var valid80 = true;
                                              }
                                              if (valid80) {
                                                if (data128.type !== void 0) {
                                                  let data131 = data128.type;
                                                  const _errs373 = errors;
                                                  if (typeof data131 !== "string") {
                                                    const err230 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                                    if (vErrors === null) {
                                                      vErrors = [err230];
                                                    } else {
                                                      vErrors.push(err230);
                                                    }
                                                    errors++;
                                                  }
                                                  if (!(data131 === "usageLimitExceeded")) {
                                                    const err231 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema100.oneOf[0].properties.type.enum } };
                                                    if (vErrors === null) {
                                                      vErrors = [err231];
                                                    } else {
                                                      vErrors.push(err231);
                                                    }
                                                    errors++;
                                                  }
                                                  var valid80 = _errs373 === errors;
                                                } else {
                                                  var valid80 = true;
                                                }
                                              }
                                            }
                                          }
                                        } else {
                                          const err232 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                          if (vErrors === null) {
                                            vErrors = [err232];
                                          } else {
                                            vErrors.push(err232);
                                          }
                                          errors++;
                                        }
                                      }
                                      var _valid14 = _errs367 === errors;
                                      if (_valid14) {
                                        valid79 = true;
                                        passing4 = 0;
                                      }
                                      if (!valid79) {
                                        const err233 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf", keyword: "oneOf", params: { passingSchemas: passing4 } };
                                        if (vErrors === null) {
                                          vErrors = [err233];
                                        } else {
                                          vErrors.push(err233);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs366;
                                        if (vErrors !== null) {
                                          if (_errs366) {
                                            vErrors.length = _errs366;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var _valid13 = _errs364 === errors;
                                      valid77 = valid77 || _valid13;
                                      if (!valid77) {
                                        const _errs375 = errors;
                                        if (data128 !== null) {
                                          const err234 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/15/properties/failure/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                          if (vErrors === null) {
                                            vErrors = [err234];
                                          } else {
                                            vErrors.push(err234);
                                          }
                                          errors++;
                                        }
                                        var _valid13 = _errs375 === errors;
                                        valid77 = valid77 || _valid13;
                                      }
                                      if (!valid77) {
                                        const err235 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/15/properties/failure/anyOf", keyword: "anyOf", params: {} };
                                        if (vErrors === null) {
                                          vErrors = [err235];
                                        } else {
                                          vErrors.push(err235);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs363;
                                        if (vErrors !== null) {
                                          if (_errs363) {
                                            vErrors.length = _errs363;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid76 = _errs362 === errors;
                                    } else {
                                      var valid76 = true;
                                    }
                                    if (valid76) {
                                      if (data.id !== void 0) {
                                        const _errs377 = errors;
                                        if (typeof data.id !== "string") {
                                          const err236 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/15/properties/id/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err236];
                                          } else {
                                            vErrors.push(err236);
                                          }
                                          errors++;
                                        }
                                        var valid76 = _errs377 === errors;
                                      } else {
                                        var valid76 = true;
                                      }
                                      if (valid76) {
                                        if (data.result !== void 0) {
                                          const _errs379 = errors;
                                          if (typeof data.result !== "string") {
                                            const err237 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/15/properties/result/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err237];
                                            } else {
                                              vErrors.push(err237);
                                            }
                                            errors++;
                                          }
                                          var valid76 = _errs379 === errors;
                                        } else {
                                          var valid76 = true;
                                        }
                                        if (valid76) {
                                          if (data.revisedPrompt !== void 0) {
                                            let data134 = data.revisedPrompt;
                                            const _errs381 = errors;
                                            if (typeof data134 !== "string" && data134 !== null) {
                                              const err238 = { instancePath: instancePath + "/revisedPrompt", schemaPath: "#/oneOf/15/properties/revisedPrompt/type", keyword: "type", params: { type: schema61.oneOf[15].properties.revisedPrompt.type } };
                                              if (vErrors === null) {
                                                vErrors = [err238];
                                              } else {
                                                vErrors.push(err238);
                                              }
                                              errors++;
                                            }
                                            var valid76 = _errs381 === errors;
                                          } else {
                                            var valid76 = true;
                                          }
                                          if (valid76) {
                                            if (data.savedPath !== void 0) {
                                              let data135 = data.savedPath;
                                              const _errs383 = errors;
                                              const _errs384 = errors;
                                              let valid81 = false;
                                              const _errs385 = errors;
                                              if (typeof data135 !== "string") {
                                                const err239 = { instancePath: instancePath + "/savedPath", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err239];
                                                } else {
                                                  vErrors.push(err239);
                                                }
                                                errors++;
                                              }
                                              var _valid15 = _errs385 === errors;
                                              valid81 = valid81 || _valid15;
                                              if (!valid81) {
                                                const _errs388 = errors;
                                                if (data135 !== null) {
                                                  const err240 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/15/properties/savedPath/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err240];
                                                  } else {
                                                    vErrors.push(err240);
                                                  }
                                                  errors++;
                                                }
                                                var _valid15 = _errs388 === errors;
                                                valid81 = valid81 || _valid15;
                                              }
                                              if (!valid81) {
                                                const err241 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/15/properties/savedPath/anyOf", keyword: "anyOf", params: {} };
                                                if (vErrors === null) {
                                                  vErrors = [err241];
                                                } else {
                                                  vErrors.push(err241);
                                                }
                                                errors++;
                                              } else {
                                                errors = _errs384;
                                                if (vErrors !== null) {
                                                  if (_errs384) {
                                                    vErrors.length = _errs384;
                                                  } else {
                                                    vErrors = null;
                                                  }
                                                }
                                              }
                                              var valid76 = _errs383 === errors;
                                            } else {
                                              var valid76 = true;
                                            }
                                            if (valid76) {
                                              if (data.status !== void 0) {
                                                const _errs390 = errors;
                                                if (typeof data.status !== "string") {
                                                  const err242 = { instancePath: instancePath + "/status", schemaPath: "#/oneOf/15/properties/status/type", keyword: "type", params: { type: "string" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err242];
                                                  } else {
                                                    vErrors.push(err242);
                                                  }
                                                  errors++;
                                                }
                                                var valid76 = _errs390 === errors;
                                              } else {
                                                var valid76 = true;
                                              }
                                              if (valid76) {
                                                if (data.transparentBackground !== void 0) {
                                                  let data137 = data.transparentBackground;
                                                  const _errs392 = errors;
                                                  if (typeof data137 !== "boolean" && data137 !== null) {
                                                    const err243 = { instancePath: instancePath + "/transparentBackground", schemaPath: "#/oneOf/15/properties/transparentBackground/type", keyword: "type", params: { type: schema61.oneOf[15].properties.transparentBackground.type } };
                                                    if (vErrors === null) {
                                                      vErrors = [err243];
                                                    } else {
                                                      vErrors.push(err243);
                                                    }
                                                    errors++;
                                                  }
                                                  var valid76 = _errs392 === errors;
                                                } else {
                                                  var valid76 = true;
                                                }
                                                if (valid76) {
                                                  if (data.type !== void 0) {
                                                    let data138 = data.type;
                                                    const _errs394 = errors;
                                                    if (typeof data138 !== "string") {
                                                      const err244 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/type", keyword: "type", params: { type: "string" } };
                                                      if (vErrors === null) {
                                                        vErrors = [err244];
                                                      } else {
                                                        vErrors.push(err244);
                                                      }
                                                      errors++;
                                                    }
                                                    if (!(data138 === "imageGeneration")) {
                                                      const err245 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[15].properties.type.enum } };
                                                      if (vErrors === null) {
                                                        vErrors = [err245];
                                                      } else {
                                                        vErrors.push(err245);
                                                      }
                                                      errors++;
                                                    }
                                                    var valid76 = _errs394 === errors;
                                                  } else {
                                                    var valid76 = true;
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
                                  const err246 = { instancePath, schemaPath: "#/oneOf/15/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err246];
                                  } else {
                                    vErrors.push(err246);
                                  }
                                  errors++;
                                }
                              }
                              var _valid0 = _errs360 === errors;
                              if (_valid0 && valid0) {
                                valid0 = false;
                                passing0 = [passing0, 15];
                              } else {
                                if (_valid0) {
                                  valid0 = true;
                                  passing0 = 15;
                                }
                                const _errs396 = errors;
                                if (errors === _errs396) {
                                  if (data && typeof data == "object" && !Array.isArray(data)) {
                                    let missing29;
                                    if (data.id === void 0 && (missing29 = "id") || data.review === void 0 && (missing29 = "review") || data.type === void 0 && (missing29 = "type")) {
                                      const err247 = { instancePath, schemaPath: "#/oneOf/16/required", keyword: "required", params: { missingProperty: missing29 } };
                                      if (vErrors === null) {
                                        vErrors = [err247];
                                      } else {
                                        vErrors.push(err247);
                                      }
                                      errors++;
                                    } else {
                                      if (data.id !== void 0) {
                                        const _errs398 = errors;
                                        if (typeof data.id !== "string") {
                                          const err248 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/16/properties/id/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err248];
                                          } else {
                                            vErrors.push(err248);
                                          }
                                          errors++;
                                        }
                                        var valid83 = _errs398 === errors;
                                      } else {
                                        var valid83 = true;
                                      }
                                      if (valid83) {
                                        if (data.review !== void 0) {
                                          const _errs400 = errors;
                                          if (typeof data.review !== "string") {
                                            const err249 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/16/properties/review/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err249];
                                            } else {
                                              vErrors.push(err249);
                                            }
                                            errors++;
                                          }
                                          var valid83 = _errs400 === errors;
                                        } else {
                                          var valid83 = true;
                                        }
                                        if (valid83) {
                                          if (data.type !== void 0) {
                                            let data141 = data.type;
                                            const _errs402 = errors;
                                            if (typeof data141 !== "string") {
                                              const err250 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err250];
                                              } else {
                                                vErrors.push(err250);
                                              }
                                              errors++;
                                            }
                                            if (!(data141 === "enteredReviewMode")) {
                                              const err251 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[16].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err251];
                                              } else {
                                                vErrors.push(err251);
                                              }
                                              errors++;
                                            }
                                            var valid83 = _errs402 === errors;
                                          } else {
                                            var valid83 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err252 = { instancePath, schemaPath: "#/oneOf/16/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err252];
                                    } else {
                                      vErrors.push(err252);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid0 = _errs396 === errors;
                                if (_valid0 && valid0) {
                                  valid0 = false;
                                  passing0 = [passing0, 16];
                                } else {
                                  if (_valid0) {
                                    valid0 = true;
                                    passing0 = 16;
                                  }
                                  const _errs404 = errors;
                                  if (errors === _errs404) {
                                    if (data && typeof data == "object" && !Array.isArray(data)) {
                                      let missing30;
                                      if (data.id === void 0 && (missing30 = "id") || data.review === void 0 && (missing30 = "review") || data.type === void 0 && (missing30 = "type")) {
                                        const err253 = { instancePath, schemaPath: "#/oneOf/17/required", keyword: "required", params: { missingProperty: missing30 } };
                                        if (vErrors === null) {
                                          vErrors = [err253];
                                        } else {
                                          vErrors.push(err253);
                                        }
                                        errors++;
                                      } else {
                                        if (data.id !== void 0) {
                                          const _errs406 = errors;
                                          if (typeof data.id !== "string") {
                                            const err254 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/17/properties/id/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err254];
                                            } else {
                                              vErrors.push(err254);
                                            }
                                            errors++;
                                          }
                                          var valid84 = _errs406 === errors;
                                        } else {
                                          var valid84 = true;
                                        }
                                        if (valid84) {
                                          if (data.review !== void 0) {
                                            const _errs408 = errors;
                                            if (typeof data.review !== "string") {
                                              const err255 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/17/properties/review/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err255];
                                              } else {
                                                vErrors.push(err255);
                                              }
                                              errors++;
                                            }
                                            var valid84 = _errs408 === errors;
                                          } else {
                                            var valid84 = true;
                                          }
                                          if (valid84) {
                                            if (data.type !== void 0) {
                                              let data144 = data.type;
                                              const _errs410 = errors;
                                              if (typeof data144 !== "string") {
                                                const err256 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err256];
                                                } else {
                                                  vErrors.push(err256);
                                                }
                                                errors++;
                                              }
                                              if (!(data144 === "exitedReviewMode")) {
                                                const err257 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[17].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err257];
                                                } else {
                                                  vErrors.push(err257);
                                                }
                                                errors++;
                                              }
                                              var valid84 = _errs410 === errors;
                                            } else {
                                              var valid84 = true;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err258 = { instancePath, schemaPath: "#/oneOf/17/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err258];
                                      } else {
                                        vErrors.push(err258);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid0 = _errs404 === errors;
                                  if (_valid0 && valid0) {
                                    valid0 = false;
                                    passing0 = [passing0, 17];
                                  } else {
                                    if (_valid0) {
                                      valid0 = true;
                                      passing0 = 17;
                                    }
                                    const _errs412 = errors;
                                    if (errors === _errs412) {
                                      if (data && typeof data == "object" && !Array.isArray(data)) {
                                        let missing31;
                                        if (data.id === void 0 && (missing31 = "id") || data.type === void 0 && (missing31 = "type")) {
                                          const err259 = { instancePath, schemaPath: "#/oneOf/18/required", keyword: "required", params: { missingProperty: missing31 } };
                                          if (vErrors === null) {
                                            vErrors = [err259];
                                          } else {
                                            vErrors.push(err259);
                                          }
                                          errors++;
                                        } else {
                                          if (data.id !== void 0) {
                                            const _errs414 = errors;
                                            if (typeof data.id !== "string") {
                                              const err260 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/18/properties/id/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err260];
                                              } else {
                                                vErrors.push(err260);
                                              }
                                              errors++;
                                            }
                                            var valid85 = _errs414 === errors;
                                          } else {
                                            var valid85 = true;
                                          }
                                          if (valid85) {
                                            if (data.type !== void 0) {
                                              let data146 = data.type;
                                              const _errs416 = errors;
                                              if (typeof data146 !== "string") {
                                                const err261 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/18/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err261];
                                                } else {
                                                  vErrors.push(err261);
                                                }
                                                errors++;
                                              }
                                              if (!(data146 === "contextCompaction")) {
                                                const err262 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/18/properties/type/enum", keyword: "enum", params: { allowedValues: schema61.oneOf[18].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err262];
                                                } else {
                                                  vErrors.push(err262);
                                                }
                                                errors++;
                                              }
                                              var valid85 = _errs416 === errors;
                                            } else {
                                              var valid85 = true;
                                            }
                                          }
                                        }
                                      } else {
                                        const err263 = { instancePath, schemaPath: "#/oneOf/18/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err263];
                                        } else {
                                          vErrors.push(err263);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid0 = _errs412 === errors;
                                    if (_valid0 && valid0) {
                                      valid0 = false;
                                      passing0 = [passing0, 18];
                                    } else {
                                      if (_valid0) {
                                        valid0 = true;
                                        passing0 = 18;
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
  if (!valid0) {
    const err264 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err264];
    } else {
      vErrors.push(err264);
    }
    errors++;
    validate47.errors = vErrors;
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
  validate47.errors = vErrors;
  return errors === 0;
}
function validate40(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.items === void 0 && (missing0 = "items") || data.status === void 0 && (missing0 = "status")) {
        validate40.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.completedAt !== void 0) {
          let data0 = data.completedAt;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0)) && data0 !== null) {
            validate40.errors = [{ instancePath: instancePath + "/completedAt", schemaPath: "#/properties/completedAt/type", keyword: "type", params: { type: schema55.properties.completedAt.type } }];
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
              validate40.errors = [{ instancePath: instancePath + "/durationMs", schemaPath: "#/properties/durationMs/type", keyword: "type", params: { type: schema55.properties.durationMs.type } }];
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
              if (!validate41(data2, { instancePath: instancePath + "/error", parentData: data, parentDataProperty: "error", rootData })) {
                vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
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
                validate40.errors = vErrors;
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
                  validate40.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
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
                        if (!validate47(data4[i0], { instancePath: instancePath + "/items/" + i0, parentData: data4, parentDataProperty: i0, rootData })) {
                          vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
                          errors = vErrors.length;
                        }
                        var valid2 = _errs14 === errors;
                        if (!valid2) {
                          break;
                        }
                      }
                    } else {
                      validate40.errors = [{ instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" } }];
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
                      const err3 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema102.oneOf[0].enum } };
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
                      const err5 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema102.oneOf[1].enum } };
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
                        const err7 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/2/enum", keyword: "enum", params: { allowedValues: schema102.oneOf[2].enum } };
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
                      validate40.errors = vErrors;
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
                        validate40.errors = [{ instancePath: instancePath + "/startedAt", schemaPath: "#/properties/startedAt/type", keyword: "type", params: { type: schema55.properties.startedAt.type } }];
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
                          validate40.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/TurnStatus/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        if (!(data8 === "completed" || data8 === "interrupted" || data8 === "failed" || data8 === "inProgress")) {
                          validate40.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/TurnStatus/enum", keyword: "enum", params: { allowedValues: schema103.enum } }];
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
      validate40.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate40.errors = vErrors;
  return errors === 0;
}
function validate31(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.cliVersion === void 0 && (missing0 = "cliVersion") || data.createdAt === void 0 && (missing0 = "createdAt") || data.cwd === void 0 && (missing0 = "cwd") || data.ephemeral === void 0 && (missing0 = "ephemeral") || data.id === void 0 && (missing0 = "id") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.preview === void 0 && (missing0 = "preview") || data.projectId === void 0 && (missing0 = "projectId") || data.sessionId === void 0 && (missing0 = "sessionId") || data.source === void 0 && (missing0 = "source") || data.status === void 0 && (missing0 = "status") || data.turns === void 0 && (missing0 = "turns") || data.updatedAt === void 0 && (missing0 = "updatedAt")) {
        validate31.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.agentNickname !== void 0) {
          let data0 = data.agentNickname;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate31.errors = [{ instancePath: instancePath + "/agentNickname", schemaPath: "#/properties/agentNickname/type", keyword: "type", params: { type: schema41.properties.agentNickname.type } }];
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
              validate31.errors = [{ instancePath: instancePath + "/agentRole", schemaPath: "#/properties/agentRole/type", keyword: "type", params: { type: schema41.properties.agentRole.type } }];
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
                validate31.errors = [{ instancePath: instancePath + "/cliVersion", schemaPath: "#/properties/cliVersion/type", keyword: "type", params: { type: "string" } }];
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
                  validate31.errors = [{ instancePath: instancePath + "/createdAt", schemaPath: "#/properties/createdAt/type", keyword: "type", params: { type: "integer" } }];
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
                    validate31.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
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
                      validate31.errors = [{ instancePath: instancePath + "/ephemeral", schemaPath: "#/properties/ephemeral/type", keyword: "type", params: { type: "boolean" } }];
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
                        validate31.errors = [{ instancePath: instancePath + "/forkedFromId", schemaPath: "#/properties/forkedFromId/type", keyword: "type", params: { type: schema41.properties.forkedFromId.type } }];
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
                                const err0 = { instancePath: instancePath + "/gitInfo/branch", schemaPath: "#/definitions/v2/GitInfo/properties/branch/type", keyword: "type", params: { type: schema43.properties.branch.type } };
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
                                  const err1 = { instancePath: instancePath + "/gitInfo/originUrl", schemaPath: "#/definitions/v2/GitInfo/properties/originUrl/type", keyword: "type", params: { type: schema43.properties.originUrl.type } };
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
                                    const err2 = { instancePath: instancePath + "/gitInfo/sha", schemaPath: "#/definitions/v2/GitInfo/properties/sha/type", keyword: "type", params: { type: schema43.properties.sha.type } };
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
                          validate31.errors = vErrors;
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
                        if (data.historyMode !== void 0) {
                          let data11 = data.historyMode;
                          const _errs30 = errors;
                          if (typeof data11 !== "string") {
                            validate31.errors = [{ instancePath: instancePath + "/historyMode", schemaPath: "#/definitions/v2/ThreadHistoryMode/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          if (!(data11 === "legacy" || data11 === "paginated")) {
                            validate31.errors = [{ instancePath: instancePath + "/historyMode", schemaPath: "#/definitions/v2/ThreadHistoryMode/enum", keyword: "enum", params: { allowedValues: schema44.enum } }];
                            return false;
                          }
                          var valid0 = _errs30 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.id !== void 0) {
                            const _errs34 = errors;
                            if (typeof data.id !== "string") {
                              validate31.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
                              return false;
                            }
                            var valid0 = _errs34 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.model !== void 0) {
                              let data13 = data.model;
                              const _errs36 = errors;
                              if (typeof data13 !== "string" && data13 !== null) {
                                validate31.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: schema41.properties.model.type } }];
                                return false;
                              }
                              var valid0 = _errs36 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.modelProvider !== void 0) {
                                const _errs38 = errors;
                                if (typeof data.modelProvider !== "string") {
                                  validate31.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                                  return false;
                                }
                                var valid0 = _errs38 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.name !== void 0) {
                                  let data15 = data.name;
                                  const _errs40 = errors;
                                  if (typeof data15 !== "string" && data15 !== null) {
                                    validate31.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: schema41.properties.name.type } }];
                                    return false;
                                  }
                                  var valid0 = _errs40 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.originator !== void 0) {
                                    let data16 = data.originator;
                                    const _errs42 = errors;
                                    if (typeof data16 !== "string" && data16 !== null) {
                                      validate31.errors = [{ instancePath: instancePath + "/originator", schemaPath: "#/properties/originator/type", keyword: "type", params: { type: schema41.properties.originator.type } }];
                                      return false;
                                    }
                                    var valid0 = _errs42 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.parentThreadId !== void 0) {
                                      let data17 = data.parentThreadId;
                                      const _errs44 = errors;
                                      if (typeof data17 !== "string" && data17 !== null) {
                                        validate31.errors = [{ instancePath: instancePath + "/parentThreadId", schemaPath: "#/properties/parentThreadId/type", keyword: "type", params: { type: schema41.properties.parentThreadId.type } }];
                                        return false;
                                      }
                                      var valid0 = _errs44 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.path !== void 0) {
                                        let data18 = data.path;
                                        const _errs46 = errors;
                                        if (typeof data18 !== "string" && data18 !== null) {
                                          validate31.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: schema41.properties.path.type } }];
                                          return false;
                                        }
                                        var valid0 = _errs46 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.preview !== void 0) {
                                          const _errs48 = errors;
                                          if (typeof data.preview !== "string") {
                                            validate31.errors = [{ instancePath: instancePath + "/preview", schemaPath: "#/properties/preview/type", keyword: "type", params: { type: "string" } }];
                                            return false;
                                          }
                                          var valid0 = _errs48 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.projectId !== void 0) {
                                            let data20 = data.projectId;
                                            const _errs50 = errors;
                                            if (typeof data20 !== "string" && data20 !== null) {
                                              validate31.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/properties/projectId/type", keyword: "type", params: { type: schema41.properties.projectId.type } }];
                                              return false;
                                            }
                                            var valid0 = _errs50 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                          if (valid0) {
                                            if (data.reasoningEffort !== void 0) {
                                              let data21 = data.reasoningEffort;
                                              const _errs52 = errors;
                                              const _errs53 = errors;
                                              let valid8 = false;
                                              const _errs54 = errors;
                                              const _errs55 = errors;
                                              if (errors === _errs55) {
                                                if (typeof data21 === "string") {
                                                  if (func2(data21) < 1) {
                                                    const err6 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                                                    if (vErrors === null) {
                                                      vErrors = [err6];
                                                    } else {
                                                      vErrors.push(err6);
                                                    }
                                                    errors++;
                                                  }
                                                } else {
                                                  const err7 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err7];
                                                  } else {
                                                    vErrors.push(err7);
                                                  }
                                                  errors++;
                                                }
                                              }
                                              var _valid1 = _errs54 === errors;
                                              valid8 = valid8 || _valid1;
                                              if (!valid8) {
                                                const _errs57 = errors;
                                                if (data21 !== null) {
                                                  const err8 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err8];
                                                  } else {
                                                    vErrors.push(err8);
                                                  }
                                                  errors++;
                                                }
                                                var _valid1 = _errs57 === errors;
                                                valid8 = valid8 || _valid1;
                                              }
                                              if (!valid8) {
                                                const err9 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                                                if (vErrors === null) {
                                                  vErrors = [err9];
                                                } else {
                                                  vErrors.push(err9);
                                                }
                                                errors++;
                                                validate31.errors = vErrors;
                                                return false;
                                              } else {
                                                errors = _errs53;
                                                if (vErrors !== null) {
                                                  if (_errs53) {
                                                    vErrors.length = _errs53;
                                                  } else {
                                                    vErrors = null;
                                                  }
                                                }
                                              }
                                              var valid0 = _errs52 === errors;
                                            } else {
                                              var valid0 = true;
                                            }
                                            if (valid0) {
                                              if (data.recencyAt !== void 0) {
                                                let data22 = data.recencyAt;
                                                const _errs59 = errors;
                                                if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22)) && data22 !== null) {
                                                  validate31.errors = [{ instancePath: instancePath + "/recencyAt", schemaPath: "#/properties/recencyAt/type", keyword: "type", params: { type: schema41.properties.recencyAt.type } }];
                                                  return false;
                                                }
                                                var valid0 = _errs59 === errors;
                                              } else {
                                                var valid0 = true;
                                              }
                                              if (valid0) {
                                                if (data.section !== void 0) {
                                                  let data23 = data.section;
                                                  const _errs61 = errors;
                                                  const _errs62 = errors;
                                                  let valid10 = false;
                                                  const _errs63 = errors;
                                                  if (!validate32(data23, { instancePath: instancePath + "/section", parentData: data, parentDataProperty: "section", rootData })) {
                                                    vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var _valid2 = _errs63 === errors;
                                                  valid10 = valid10 || _valid2;
                                                  if (!valid10) {
                                                    const _errs64 = errors;
                                                    if (data23 !== null) {
                                                      const err10 = { instancePath: instancePath + "/section", schemaPath: "#/properties/section/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                      if (vErrors === null) {
                                                        vErrors = [err10];
                                                      } else {
                                                        vErrors.push(err10);
                                                      }
                                                      errors++;
                                                    }
                                                    var _valid2 = _errs64 === errors;
                                                    valid10 = valid10 || _valid2;
                                                  }
                                                  if (!valid10) {
                                                    const err11 = { instancePath: instancePath + "/section", schemaPath: "#/properties/section/anyOf", keyword: "anyOf", params: {} };
                                                    if (vErrors === null) {
                                                      vErrors = [err11];
                                                    } else {
                                                      vErrors.push(err11);
                                                    }
                                                    errors++;
                                                    validate31.errors = vErrors;
                                                    return false;
                                                  } else {
                                                    errors = _errs62;
                                                    if (vErrors !== null) {
                                                      if (_errs62) {
                                                        vErrors.length = _errs62;
                                                      } else {
                                                        vErrors = null;
                                                      }
                                                    }
                                                  }
                                                  var valid0 = _errs61 === errors;
                                                } else {
                                                  var valid0 = true;
                                                }
                                                if (valid0) {
                                                  if (data.sectionEnteredAt !== void 0) {
                                                    let data24 = data.sectionEnteredAt;
                                                    const _errs66 = errors;
                                                    if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24)) && data24 !== null) {
                                                      validate31.errors = [{ instancePath: instancePath + "/sectionEnteredAt", schemaPath: "#/properties/sectionEnteredAt/type", keyword: "type", params: { type: schema41.properties.sectionEnteredAt.type } }];
                                                      return false;
                                                    }
                                                    var valid0 = _errs66 === errors;
                                                  } else {
                                                    var valid0 = true;
                                                  }
                                                  if (valid0) {
                                                    if (data.sessionId !== void 0) {
                                                      const _errs68 = errors;
                                                      if (typeof data.sessionId !== "string") {
                                                        validate31.errors = [{ instancePath: instancePath + "/sessionId", schemaPath: "#/properties/sessionId/type", keyword: "type", params: { type: "string" } }];
                                                        return false;
                                                      }
                                                      var valid0 = _errs68 === errors;
                                                    } else {
                                                      var valid0 = true;
                                                    }
                                                    if (valid0) {
                                                      if (data.source !== void 0) {
                                                        const _errs70 = errors;
                                                        if (!validate34(data.source, { instancePath: instancePath + "/source", parentData: data, parentDataProperty: "source", rootData })) {
                                                          vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
                                                          errors = vErrors.length;
                                                        }
                                                        var valid0 = _errs70 === errors;
                                                      } else {
                                                        var valid0 = true;
                                                      }
                                                      if (valid0) {
                                                        if (data.status !== void 0) {
                                                          const _errs72 = errors;
                                                          if (!validate38(data.status, { instancePath: instancePath + "/status", parentData: data, parentDataProperty: "status", rootData })) {
                                                            vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
                                                            errors = vErrors.length;
                                                          }
                                                          var valid0 = _errs72 === errors;
                                                        } else {
                                                          var valid0 = true;
                                                        }
                                                        if (valid0) {
                                                          if (data.threadSource !== void 0) {
                                                            let data28 = data.threadSource;
                                                            const _errs74 = errors;
                                                            const _errs75 = errors;
                                                            let valid13 = false;
                                                            const _errs76 = errors;
                                                            if (typeof data28 !== "string") {
                                                              const err12 = { instancePath: instancePath + "/threadSource", schemaPath: "#/definitions/v2/ThreadSource/type", keyword: "type", params: { type: "string" } };
                                                              if (vErrors === null) {
                                                                vErrors = [err12];
                                                              } else {
                                                                vErrors.push(err12);
                                                              }
                                                              errors++;
                                                            }
                                                            var _valid3 = _errs76 === errors;
                                                            valid13 = valid13 || _valid3;
                                                            if (!valid13) {
                                                              const _errs79 = errors;
                                                              if (data28 !== null) {
                                                                const err13 = { instancePath: instancePath + "/threadSource", schemaPath: "#/properties/threadSource/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                                if (vErrors === null) {
                                                                  vErrors = [err13];
                                                                } else {
                                                                  vErrors.push(err13);
                                                                }
                                                                errors++;
                                                              }
                                                              var _valid3 = _errs79 === errors;
                                                              valid13 = valid13 || _valid3;
                                                            }
                                                            if (!valid13) {
                                                              const err14 = { instancePath: instancePath + "/threadSource", schemaPath: "#/properties/threadSource/anyOf", keyword: "anyOf", params: {} };
                                                              if (vErrors === null) {
                                                                vErrors = [err14];
                                                              } else {
                                                                vErrors.push(err14);
                                                              }
                                                              errors++;
                                                              validate31.errors = vErrors;
                                                              return false;
                                                            } else {
                                                              errors = _errs75;
                                                              if (vErrors !== null) {
                                                                if (_errs75) {
                                                                  vErrors.length = _errs75;
                                                                } else {
                                                                  vErrors = null;
                                                                }
                                                              }
                                                            }
                                                            var valid0 = _errs74 === errors;
                                                          } else {
                                                            var valid0 = true;
                                                          }
                                                          if (valid0) {
                                                            if (data.turns !== void 0) {
                                                              let data29 = data.turns;
                                                              const _errs81 = errors;
                                                              if (errors === _errs81) {
                                                                if (Array.isArray(data29)) {
                                                                  var valid15 = true;
                                                                  const len0 = data29.length;
                                                                  for (let i0 = 0; i0 < len0; i0++) {
                                                                    const _errs83 = errors;
                                                                    if (!validate40(data29[i0], { instancePath: instancePath + "/turns/" + i0, parentData: data29, parentDataProperty: i0, rootData })) {
                                                                      vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
                                                                      errors = vErrors.length;
                                                                    }
                                                                    var valid15 = _errs83 === errors;
                                                                    if (!valid15) {
                                                                      break;
                                                                    }
                                                                  }
                                                                } else {
                                                                  validate31.errors = [{ instancePath: instancePath + "/turns", schemaPath: "#/properties/turns/type", keyword: "type", params: { type: "array" } }];
                                                                  return false;
                                                                }
                                                              }
                                                              var valid0 = _errs81 === errors;
                                                            } else {
                                                              var valid0 = true;
                                                            }
                                                            if (valid0) {
                                                              if (data.updatedAt !== void 0) {
                                                                let data31 = data.updatedAt;
                                                                const _errs84 = errors;
                                                                if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
                                                                  validate31.errors = [{ instancePath: instancePath + "/updatedAt", schemaPath: "#/properties/updatedAt/type", keyword: "type", params: { type: "integer" } }];
                                                                  return false;
                                                                }
                                                                var valid0 = _errs84 === errors;
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
              }
            }
          }
        }
      }
    } else {
      validate31.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate31.errors = vErrors;
  return errors === 0;
}
function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.approvalPolicy === void 0 && (missing0 = "approvalPolicy") || data.approvalsReviewer === void 0 && (missing0 = "approvalsReviewer") || data.cwd === void 0 && (missing0 = "cwd") || data.model === void 0 && (missing0 = "model") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.reasoningEffort === void 0 && (missing0 = "reasoningEffort") || data.sandbox === void 0 && (missing0 = "sandbox") || data.serviceTier === void 0 && (missing0 = "serviceTier") || data.thread === void 0 && (missing0 = "thread")) {
        validate28.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema33.oneOf[0].enum } };
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
            validate28.errors = vErrors;
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
              validate28.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              validate28.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema34.enum } }];
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
                validate28.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs25 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.disabledPluginIds !== void 0) {
                let data9 = data.disabledPluginIds;
                const _errs28 = errors;
                if (errors === _errs28) {
                  if (Array.isArray(data9)) {
                    var valid8 = true;
                    const len0 = data9.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      const _errs30 = errors;
                      if (typeof data9[i0] !== "string") {
                        validate28.errors = [{ instancePath: instancePath + "/disabledPluginIds/" + i0, schemaPath: "#/properties/disabledPluginIds/items/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid8 = _errs30 === errors;
                      if (!valid8) {
                        break;
                      }
                    }
                  } else {
                    validate28.errors = [{ instancePath: instancePath + "/disabledPluginIds", schemaPath: "#/properties/disabledPluginIds/type", keyword: "type", params: { type: "array" } }];
                    return false;
                  }
                }
                var valid0 = _errs28 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.instructionSources !== void 0) {
                  let data11 = data.instructionSources;
                  const _errs32 = errors;
                  if (errors === _errs32) {
                    if (Array.isArray(data11)) {
                      var valid9 = true;
                      const len1 = data11.length;
                      for (let i1 = 0; i1 < len1; i1++) {
                        const _errs34 = errors;
                        if (typeof data11[i1] !== "string") {
                          validate28.errors = [{ instancePath: instancePath + "/instructionSources/" + i1, schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        var valid9 = _errs34 === errors;
                        if (!valid9) {
                          break;
                        }
                      }
                    } else {
                      validate28.errors = [{ instancePath: instancePath + "/instructionSources", schemaPath: "#/properties/instructionSources/type", keyword: "type", params: { type: "array" } }];
                      return false;
                    }
                  }
                  var valid0 = _errs32 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.model !== void 0) {
                    const _errs37 = errors;
                    if (typeof data.model !== "string") {
                      validate28.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid0 = _errs37 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.modelProvider !== void 0) {
                      const _errs39 = errors;
                      if (typeof data.modelProvider !== "string") {
                        validate28.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid0 = _errs39 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.reasoningEffort !== void 0) {
                        let data15 = data.reasoningEffort;
                        const _errs41 = errors;
                        const _errs42 = errors;
                        let valid11 = false;
                        const _errs43 = errors;
                        const _errs44 = errors;
                        if (errors === _errs44) {
                          if (typeof data15 === "string") {
                            if (func2(data15) < 1) {
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
                        var _valid1 = _errs43 === errors;
                        valid11 = valid11 || _valid1;
                        if (!valid11) {
                          const _errs46 = errors;
                          if (data15 !== null) {
                            const err15 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err15];
                            } else {
                              vErrors.push(err15);
                            }
                            errors++;
                          }
                          var _valid1 = _errs46 === errors;
                          valid11 = valid11 || _valid1;
                        }
                        if (!valid11) {
                          const err16 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                          if (vErrors === null) {
                            vErrors = [err16];
                          } else {
                            vErrors.push(err16);
                          }
                          errors++;
                          validate28.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs42;
                          if (vErrors !== null) {
                            if (_errs42) {
                              vErrors.length = _errs42;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid0 = _errs41 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.sandbox !== void 0) {
                          const _errs48 = errors;
                          if (!validate29(data.sandbox, { instancePath: instancePath + "/sandbox", parentData: data, parentDataProperty: "sandbox", rootData })) {
                            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs48 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.serviceTier !== void 0) {
                            let data17 = data.serviceTier;
                            const _errs50 = errors;
                            if (typeof data17 !== "string" && data17 !== null) {
                              validate28.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema32.properties.serviceTier.type } }];
                              return false;
                            }
                            var valid0 = _errs50 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.thread !== void 0) {
                              const _errs52 = errors;
                              if (!validate31(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                                vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs52 === errors;
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
    } else {
      validate28.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate28.errors = vErrors;
  return errors === 0;
}
function validate27(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate28(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
    errors = vErrors.length;
  }
  validate27.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadListResponse = validate70;
var schema105 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "backwardsCursor": { "description": "Opaque cursor to pass as `cursor` when reversing `sortDirection`. This is only populated when the page contains at least one thread. Use it with the opposite `sortDirection`; for timestamp sorts it anchors at the start of the page timestamp so same-second updates are not skipped.", "type": ["string", "null"] }, "data": { "items": { "$ref": "#/definitions/v2/Thread" }, "type": "array" }, "nextCursor": { "description": "Opaque cursor to pass to the next call to continue after the last item. if None, there are no more items to return.", "type": ["string", "null"] } }, "required": ["backwardsCursor", "data", "nextCursor"], "title": "ThreadListResponse", "type": "object" };
function validate71(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.backwardsCursor === void 0 && (missing0 = "backwardsCursor") || data.data === void 0 && (missing0 = "data") || data.nextCursor === void 0 && (missing0 = "nextCursor")) {
        validate71.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.backwardsCursor !== void 0) {
          let data0 = data.backwardsCursor;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate71.errors = [{ instancePath: instancePath + "/backwardsCursor", schemaPath: "#/properties/backwardsCursor/type", keyword: "type", params: { type: schema105.properties.backwardsCursor.type } }];
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
                  if (!validate31(data1[i0], { instancePath: instancePath + "/data/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                    errors = vErrors.length;
                  }
                  var valid1 = _errs5 === errors;
                  if (!valid1) {
                    break;
                  }
                }
              } else {
                validate71.errors = [{ instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: "array" } }];
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
                validate71.errors = [{ instancePath: instancePath + "/nextCursor", schemaPath: "#/properties/nextCursor/type", keyword: "type", params: { type: schema105.properties.nextCursor.type } }];
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
var validateV2ThreadLoadedListResponse = validate74;
var schema107 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "data": { "description": "Thread ids for sessions currently loaded in memory.", "items": { "type": "string" }, "type": "array" }, "nextCursor": { "description": "Opaque cursor to pass to the next call to continue after the last item. if None, there are no more items to return.", "type": ["string", "null"] } }, "required": ["data", "nextCursor"], "title": "ThreadLoadedListResponse", "type": "object" };
function validate74(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  if (errors === _errs0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.data === void 0 && (missing0 = "data") || data.nextCursor === void 0 && (missing0 = "nextCursor")) {
        validate74.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadLoadedListResponse/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.data !== void 0) {
          let data0 = data.data;
          const _errs2 = errors;
          if (errors === _errs2) {
            if (Array.isArray(data0)) {
              var valid2 = true;
              const len0 = data0.length;
              for (let i0 = 0; i0 < len0; i0++) {
                const _errs4 = errors;
                if (typeof data0[i0] !== "string") {
                  validate74.errors = [{ instancePath: instancePath + "/data/" + i0, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadLoadedListResponse/properties/data/items/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid2 = _errs4 === errors;
                if (!valid2) {
                  break;
                }
              }
            } else {
              validate74.errors = [{ instancePath: instancePath + "/data", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadLoadedListResponse/properties/data/type", keyword: "type", params: { type: "array" } }];
              return false;
            }
          }
          var valid1 = _errs2 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.nextCursor !== void 0) {
            let data2 = data.nextCursor;
            const _errs6 = errors;
            if (typeof data2 !== "string" && data2 !== null) {
              validate74.errors = [{ instancePath: instancePath + "/nextCursor", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadLoadedListResponse/properties/nextCursor/type", keyword: "type", params: { type: schema107.properties.nextCursor.type } }];
              return false;
            }
            var valid1 = _errs6 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      validate74.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/ThreadLoadedListResponse/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate74.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionAttachResponse = validate75;
var schema110 = { "properties": { "goal": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadGoal" }, { "type": "null" }] }, "headCommitId": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" }, "tokenUsage": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadTokenUsage" }, { "type": "null" }] } }, "required": ["thread"], "type": "object" };
var schema111 = { "properties": { "createdAt": { "format": "int64", "type": "integer" }, "objective": { "type": "string" }, "status": { "$ref": "#/definitions/v2/ThreadGoalStatus" }, "threadId": { "type": "string" }, "timeUsedSeconds": { "format": "int64", "type": "integer" }, "tokenBudget": { "format": "int64", "type": ["integer", "null"] }, "tokensUsed": { "format": "int64", "type": "integer" }, "updatedAt": { "format": "int64", "type": "integer" } }, "required": ["createdAt", "objective", "status", "threadId", "timeUsedSeconds", "tokensUsed", "updatedAt"], "type": "object" };
var schema112 = { "enum": ["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"], "type": "string" };
function validate78(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.createdAt === void 0 && (missing0 = "createdAt") || data.objective === void 0 && (missing0 = "objective") || data.status === void 0 && (missing0 = "status") || data.threadId === void 0 && (missing0 = "threadId") || data.timeUsedSeconds === void 0 && (missing0 = "timeUsedSeconds") || data.tokensUsed === void 0 && (missing0 = "tokensUsed") || data.updatedAt === void 0 && (missing0 = "updatedAt")) {
        validate78.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.createdAt !== void 0) {
          let data0 = data.createdAt;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            validate78.errors = [{ instancePath: instancePath + "/createdAt", schemaPath: "#/properties/createdAt/type", keyword: "type", params: { type: "integer" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.objective !== void 0) {
            const _errs3 = errors;
            if (typeof data.objective !== "string") {
              validate78.errors = [{ instancePath: instancePath + "/objective", schemaPath: "#/properties/objective/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.status !== void 0) {
              let data2 = data.status;
              const _errs5 = errors;
              if (typeof data2 !== "string") {
                validate78.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadGoalStatus/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              if (!(data2 === "active" || data2 === "paused" || data2 === "blocked" || data2 === "usageLimited" || data2 === "budgetLimited" || data2 === "complete")) {
                validate78.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadGoalStatus/enum", keyword: "enum", params: { allowedValues: schema112.enum } }];
                return false;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.threadId !== void 0) {
                const _errs8 = errors;
                if (typeof data.threadId !== "string") {
                  validate78.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs8 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.timeUsedSeconds !== void 0) {
                  let data4 = data.timeUsedSeconds;
                  const _errs10 = errors;
                  if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                    validate78.errors = [{ instancePath: instancePath + "/timeUsedSeconds", schemaPath: "#/properties/timeUsedSeconds/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  var valid0 = _errs10 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.tokenBudget !== void 0) {
                    let data5 = data.tokenBudget;
                    const _errs12 = errors;
                    if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5)) && data5 !== null) {
                      validate78.errors = [{ instancePath: instancePath + "/tokenBudget", schemaPath: "#/properties/tokenBudget/type", keyword: "type", params: { type: schema111.properties.tokenBudget.type } }];
                      return false;
                    }
                    var valid0 = _errs12 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.tokensUsed !== void 0) {
                      let data6 = data.tokensUsed;
                      const _errs14 = errors;
                      if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                        validate78.errors = [{ instancePath: instancePath + "/tokensUsed", schemaPath: "#/properties/tokensUsed/type", keyword: "type", params: { type: "integer" } }];
                        return false;
                      }
                      var valid0 = _errs14 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.updatedAt !== void 0) {
                        let data7 = data.updatedAt;
                        const _errs16 = errors;
                        if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
                          validate78.errors = [{ instancePath: instancePath + "/updatedAt", schemaPath: "#/properties/updatedAt/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        var valid0 = _errs16 === errors;
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
      validate78.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate78.errors = vErrors;
  return errors === 0;
}
var schema113 = { "properties": { "last": { "$ref": "#/definitions/v2/TokenUsageBreakdown" }, "modelContextWindow": { "format": "int64", "type": ["integer", "null"] }, "total": { "$ref": "#/definitions/v2/TokenUsageBreakdown" } }, "required": ["last", "total"], "type": "object" };
function validate81(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.last === void 0 && (missing0 = "last") || data.total === void 0 && (missing0 = "total")) {
        validate81.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                validate81.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.cacheWriteInputTokens !== void 0) {
                  let data1 = data0.cacheWriteInputTokens;
                  const _errs4 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate81.errors = [{ instancePath: instancePath + "/last/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                      validate81.errors = [{ instancePath: instancePath + "/last/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                        validate81.errors = [{ instancePath: instancePath + "/last/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                          validate81.errors = [{ instancePath: instancePath + "/last/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                            validate81.errors = [{ instancePath: instancePath + "/last/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                              validate81.errors = [{ instancePath: instancePath + "/last/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
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
              validate81.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
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
              validate81.errors = [{ instancePath: instancePath + "/modelContextWindow", schemaPath: "#/properties/modelContextWindow/type", keyword: "type", params: { type: schema113.properties.modelContextWindow.type } }];
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
                    validate81.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing2 } }];
                    return false;
                  } else {
                    if (data8.cacheWriteInputTokens !== void 0) {
                      let data9 = data8.cacheWriteInputTokens;
                      const _errs21 = errors;
                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                        validate81.errors = [{ instancePath: instancePath + "/total/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                          validate81.errors = [{ instancePath: instancePath + "/total/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                            validate81.errors = [{ instancePath: instancePath + "/total/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                              validate81.errors = [{ instancePath: instancePath + "/total/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                                validate81.errors = [{ instancePath: instancePath + "/total/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                                  validate81.errors = [{ instancePath: instancePath + "/total/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
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
                  validate81.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
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
      validate81.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate81.errors = vErrors;
  return errors === 0;
}
function validate77(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate77.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.goal !== void 0) {
          let data0 = data.goal;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          if (!validate78(data0, { instancePath: instancePath + "/goal", parentData: data, parentDataProperty: "goal", rootData })) {
            vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs4 = errors;
            if (data0 !== null) {
              const err0 = { instancePath: instancePath + "/goal", schemaPath: "#/properties/goal/anyOf/1/type", keyword: "type", params: { type: "null" } };
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
            const err1 = { instancePath: instancePath + "/goal", schemaPath: "#/properties/goal/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate77.errors = vErrors;
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
          if (data.headCommitId !== void 0) {
            let data1 = data.headCommitId;
            const _errs6 = errors;
            if (typeof data1 !== "string" && data1 !== null) {
              validate77.errors = [{ instancePath: instancePath + "/headCommitId", schemaPath: "#/properties/headCommitId/type", keyword: "type", params: { type: schema110.properties.headCommitId.type } }];
              return false;
            }
            var valid0 = _errs6 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.thread !== void 0) {
              const _errs8 = errors;
              if (!validate31(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.tokenUsage !== void 0) {
                let data3 = data.tokenUsage;
                const _errs9 = errors;
                const _errs10 = errors;
                let valid2 = false;
                const _errs11 = errors;
                if (!validate81(data3, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
                  vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
                  errors = vErrors.length;
                }
                var _valid1 = _errs11 === errors;
                valid2 = valid2 || _valid1;
                if (!valid2) {
                  const _errs12 = errors;
                  if (data3 !== null) {
                    const err2 = { instancePath: instancePath + "/tokenUsage", schemaPath: "#/properties/tokenUsage/anyOf/1/type", keyword: "type", params: { type: "null" } };
                    if (vErrors === null) {
                      vErrors = [err2];
                    } else {
                      vErrors.push(err2);
                    }
                    errors++;
                  }
                  var _valid1 = _errs12 === errors;
                  valid2 = valid2 || _valid1;
                }
                if (!valid2) {
                  const err3 = { instancePath: instancePath + "/tokenUsage", schemaPath: "#/properties/tokenUsage/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                  validate77.errors = vErrors;
                  return false;
                } else {
                  errors = _errs10;
                  if (vErrors !== null) {
                    if (_errs10) {
                      vErrors.length = _errs10;
                    } else {
                      vErrors = null;
                    }
                  }
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
      validate77.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate77.errors = vErrors;
  return errors === 0;
}
function validate76(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.snapshot === void 0 && (missing0 = "snapshot") || data.subscriptionId === void 0 && (missing0 = "subscriptionId")) {
        validate76.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.snapshot !== void 0) {
          const _errs1 = errors;
          if (!validate77(data.snapshot, { instancePath: instancePath + "/snapshot", parentData: data, parentDataProperty: "snapshot", rootData })) {
            vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
              validate76.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
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
var validateV2ThreadProjectionClosedNotification = validate85;
var schema118 = { "enum": ["backpressure"], "type": "string" };
function validate86(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.reason === void 0 && (missing0 = "reason") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate86.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.reason !== void 0) {
          let data0 = data.reason;
          const _errs1 = errors;
          if (typeof data0 !== "string") {
            validate86.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "backpressure")) {
            validate86.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/enum", keyword: "enum", params: { allowedValues: schema118.enum } }];
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
              validate86.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                validate86.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate86.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate86.errors = vErrors;
  return errors === 0;
}
function validate85(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate86(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
    errors = vErrors.length;
  }
  validate85.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDeltaNotification = validate88;
var schema121 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/AgentMessageDeltaNotification" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "AgentMessageThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryTextDeltaNotification" }, "type": { "enum": ["reasoningSummaryText"], "title": "ReasoningSummaryTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryTextThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryPartAddedNotification" }, "type": { "enum": ["reasoningSummaryPartAdded"], "title": "ReasoningSummaryPartAddedThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryPartAddedThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningTextDeltaNotification" }, "type": { "enum": ["reasoningText"], "title": "ReasoningTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningTextThreadProjectionDelta", "type": "object" }] };
function validate90(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
              const err8 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema121.oneOf[0].properties.type.enum } };
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
              const err19 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema121.oneOf[1].properties.type.enum } };
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
                const err29 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema121.oneOf[2].properties.type.enum } };
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
                  const err40 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema121.oneOf[3].properties.type.enum } };
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
    validate90.errors = vErrors;
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
  validate90.errors = vErrors;
  return errors === 0;
}
function validate89(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.delta === void 0 && (missing0 = "delta") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate89.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.delta !== void 0) {
          const _errs1 = errors;
          if (!validate90(data.delta, { instancePath: instancePath + "/delta", parentData: data, parentDataProperty: "delta", rootData })) {
            vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
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
              validate89.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                validate89.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate89.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate89.errors = vErrors;
  return errors === 0;
}
function validate88(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate89(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate89.errors : vErrors.concat(validate89.errors);
    errors = vErrors.length;
  }
  validate88.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDetachResponse = validate93;
var schema128 = { "enum": ["detached", "notSubscribed", "notLoaded"], "type": "string" };
function validate94(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate94.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.status !== void 0) {
          let data0 = data.status;
          if (typeof data0 !== "string") {
            validate94.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "detached" || data0 === "notSubscribed" || data0 === "notLoaded")) {
            validate94.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/enum", keyword: "enum", params: { allowedValues: schema128.enum } }];
            return false;
          }
        }
      }
    } else {
      validate94.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate94.errors = vErrors;
  return errors === 0;
}
function validate93(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate94(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate94.errors : vErrors.concat(validate94.errors);
    errors = vErrors.length;
  }
  validate93.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionEventNotification = validate96;
var schema130 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "commitId": { "type": "string" }, "event": { "$ref": "#/definitions/v2/ThreadProjectionEvent" }, "parentCommitId": { "type": ["string", "null"] }, "subscriptionId": { "type": "string" }, "threadId": { "type": "string" } }, "required": ["commitId", "event", "subscriptionId", "threadId"], "title": "ThreadProjectionEventNotification", "type": "object" };
var schema131 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/TurnStartedNotification" }, "type": { "enum": ["turnStarted"], "title": "TurnStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/TurnCompletedNotification" }, "type": { "enum": ["turnCompleted"], "title": "TurnCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemStartedNotification" }, "type": { "enum": ["itemStarted"], "title": "ItemStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemCompletedNotification" }, "type": { "enum": ["itemCompleted"], "title": "ItemCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ThreadTokenUsageUpdatedNotification" }, "type": { "enum": ["tokenUsageUpdated"], "title": "TokenUsageUpdatedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TokenUsageUpdatedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ThreadGoalUpdatedNotification" }, "type": { "enum": ["goalUpdated"], "title": "GoalUpdatedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "GoalUpdatedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ThreadGoalClearedNotification" }, "type": { "enum": ["goalCleared"], "title": "GoalClearedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "GoalClearedThreadProjectionEvent", "type": "object" }] };
function validate99(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate99.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate99.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turn !== void 0) {
            const _errs3 = errors;
            if (!validate40(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
              vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
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
function validate102(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate102.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate102.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.turn !== void 0) {
            const _errs3 = errors;
            if (!validate40(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
              vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate102.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate102.errors = vErrors;
  return errors === 0;
}
function validate105(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.item === void 0 && (missing0 = "item") || data.startedAtMs === void 0 && (missing0 = "startedAtMs") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate105.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.item !== void 0) {
          const _errs1 = errors;
          if (!validate47(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
            vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
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
              validate105.errors = [{ instancePath: instancePath + "/startedAtMs", schemaPath: "#/properties/startedAtMs/type", keyword: "type", params: { type: "integer" } }];
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
                validate105.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
                  validate105.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate105.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate105.errors = vErrors;
  return errors === 0;
}
function validate108(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.completedAtMs === void 0 && (missing0 = "completedAtMs") || data.item === void 0 && (missing0 = "item") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate108.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.completedAtMs !== void 0) {
          let data0 = data.completedAtMs;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            validate108.errors = [{ instancePath: instancePath + "/completedAtMs", schemaPath: "#/properties/completedAtMs/type", keyword: "type", params: { type: "integer" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.item !== void 0) {
            const _errs3 = errors;
            if (!validate47(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
              vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
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
                validate108.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
                  validate108.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate108.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate108.errors = vErrors;
  return errors === 0;
}
function validate111(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.tokenUsage === void 0 && (missing0 = "tokenUsage") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate111.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate111.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.tokenUsage !== void 0) {
            const _errs3 = errors;
            if (!validate81(data.tokenUsage, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
              vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
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
                validate111.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate111.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate111.errors = vErrors;
  return errors === 0;
}
var schema137 = { "properties": { "goal": { "$ref": "#/definitions/v2/ThreadGoal" }, "threadId": { "type": "string" }, "turnId": { "type": ["string", "null"] } }, "required": ["goal", "threadId"], "type": "object" };
function validate114(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.goal === void 0 && (missing0 = "goal") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate114.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.goal !== void 0) {
          const _errs1 = errors;
          if (!validate78(data.goal, { instancePath: instancePath + "/goal", parentData: data, parentDataProperty: "goal", rootData })) {
            vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.threadId !== void 0) {
            const _errs2 = errors;
            if (typeof data.threadId !== "string") {
              validate114.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.turnId !== void 0) {
              let data2 = data.turnId;
              const _errs4 = errors;
              if (typeof data2 !== "string" && data2 !== null) {
                validate114.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: schema137.properties.turnId.type } }];
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
      validate114.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate114.errors = vErrors;
  return errors === 0;
}
function validate98(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!validate99(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
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
              const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[0].properties.type.enum } };
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
          if (!validate102(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate102.errors : vErrors.concat(validate102.errors);
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
              const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[1].properties.type.enum } };
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
            if (!validate105(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
              vErrors = vErrors === null ? validate105.errors : vErrors.concat(validate105.errors);
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
                const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[2].properties.type.enum } };
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
              if (!validate108(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                vErrors = vErrors === null ? validate108.errors : vErrors.concat(validate108.errors);
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
                  const err14 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[3].properties.type.enum } };
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
                if (!validate111(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                  vErrors = vErrors === null ? validate111.errors : vErrors.concat(validate111.errors);
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
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[4].properties.type.enum } };
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
          const _errs26 = errors;
          if (errors === _errs26) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing5;
              if (data.notification === void 0 && (missing5 = "notification") || data.type === void 0 && (missing5 = "type")) {
                const err20 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing5 } };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              } else {
                if (data.notification !== void 0) {
                  const _errs28 = errors;
                  if (!validate114(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                    vErrors = vErrors === null ? validate114.errors : vErrors.concat(validate114.errors);
                    errors = vErrors.length;
                  }
                  var valid6 = _errs28 === errors;
                } else {
                  var valid6 = true;
                }
                if (valid6) {
                  if (data.type !== void 0) {
                    let data11 = data.type;
                    const _errs29 = errors;
                    if (typeof data11 !== "string") {
                      const err21 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                    if (!(data11 === "goalUpdated")) {
                      const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[5].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                    var valid6 = _errs29 === errors;
                  } else {
                    var valid6 = true;
                  }
                }
              }
            } else {
              const err23 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
          var _valid0 = _errs26 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs31 = errors;
            if (errors === _errs31) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing6;
                if (data.notification === void 0 && (missing6 = "notification") || data.type === void 0 && (missing6 = "type")) {
                  const err24 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing6 } };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                } else {
                  if (data.notification !== void 0) {
                    let data12 = data.notification;
                    const _errs33 = errors;
                    const _errs34 = errors;
                    if (errors === _errs34) {
                      if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
                        let missing7;
                        if (data12.threadId === void 0 && (missing7 = "threadId")) {
                          const err25 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ThreadGoalClearedNotification/required", keyword: "required", params: { missingProperty: missing7 } };
                          if (vErrors === null) {
                            vErrors = [err25];
                          } else {
                            vErrors.push(err25);
                          }
                          errors++;
                        } else {
                          if (data12.threadId !== void 0) {
                            if (typeof data12.threadId !== "string") {
                              const err26 = { instancePath: instancePath + "/notification/threadId", schemaPath: "#/definitions/v2/ThreadGoalClearedNotification/properties/threadId/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err26];
                              } else {
                                vErrors.push(err26);
                              }
                              errors++;
                            }
                          }
                        }
                      } else {
                        const err27 = { instancePath: instancePath + "/notification", schemaPath: "#/definitions/v2/ThreadGoalClearedNotification/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err27];
                        } else {
                          vErrors.push(err27);
                        }
                        errors++;
                      }
                    }
                    var valid7 = _errs33 === errors;
                  } else {
                    var valid7 = true;
                  }
                  if (valid7) {
                    if (data.type !== void 0) {
                      let data14 = data.type;
                      const _errs38 = errors;
                      if (typeof data14 !== "string") {
                        const err28 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err28];
                        } else {
                          vErrors.push(err28);
                        }
                        errors++;
                      }
                      if (!(data14 === "goalCleared")) {
                        const err29 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema131.oneOf[6].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err29];
                        } else {
                          vErrors.push(err29);
                        }
                        errors++;
                      }
                      var valid7 = _errs38 === errors;
                    } else {
                      var valid7 = true;
                    }
                  }
                }
              } else {
                const err30 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            var _valid0 = _errs31 === errors;
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
    const err31 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err31];
    } else {
      vErrors.push(err31);
    }
    errors++;
    validate98.errors = vErrors;
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
  validate98.errors = vErrors;
  return errors === 0;
}
function validate97(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.commitId === void 0 && (missing0 = "commitId") || data.event === void 0 && (missing0 = "event") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate97.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.commitId !== void 0) {
          const _errs1 = errors;
          if (typeof data.commitId !== "string") {
            validate97.errors = [{ instancePath: instancePath + "/commitId", schemaPath: "#/properties/commitId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.event !== void 0) {
            const _errs3 = errors;
            if (!validate98(data.event, { instancePath: instancePath + "/event", parentData: data, parentDataProperty: "event", rootData })) {
              vErrors = vErrors === null ? validate98.errors : vErrors.concat(validate98.errors);
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
                validate97.errors = [{ instancePath: instancePath + "/parentCommitId", schemaPath: "#/properties/parentCommitId/type", keyword: "type", params: { type: schema130.properties.parentCommitId.type } }];
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
                  validate97.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                    validate97.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate97.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate97.errors = vErrors;
  return errors === 0;
}
function validate96(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate97(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate97.errors : vErrors.concat(validate97.errors);
    errors = vErrors.length;
  }
  validate96.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadReadResponse = validate119;
function validate120(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate120.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.thread !== void 0) {
          if (!validate31(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
            vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
            errors = vErrors.length;
          }
        }
      }
    } else {
      validate120.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate120.errors = vErrors;
  return errors === 0;
}
function validate119(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate120(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate120.errors : vErrors.concat(validate120.errors);
    errors = vErrors.length;
  }
  validate119.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadResumeResponse = validate123;
var schema142 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "$ref": "#/definitions/v2/AskForApproval" }, "approvalsReviewer": { "allOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }], "description": "Reviewer currently used for approval requests on this thread." }, "collaborationMode": { "anyOf": [{ "$ref": "#/definitions/v2/CollaborationMode" }, { "type": "null" }], "description": "Effective collaboration mode. Absent when resuming from an older server." }, "cwd": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "disabledPluginIds": { "default": [], "description": "Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.", "items": { "type": "string" }, "type": "array" }, "instructionSources": { "default": [], "description": "Environment-native paths to instruction source files currently loaded for this thread.", "items": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": "array" }, "itemsBackwardsCursor": { "description": 'Opaque cursor for hydrating paginated items backwards.\n\nPass this as `cursor` to `thread/items/list` with `sortDirection: "desc"`. The first page includes the item identified by the cursor.', "type": ["string", "null"] }, "model": { "type": "string" }, "modelProvider": { "type": "string" }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] }, "sandbox": { "allOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }], "description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance." }, "serviceTier": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" }, "turnsBackwardsCursor": { "description": 'Opaque cursor for hydrating paginated turns backwards.\n\nPass this as `cursor` to `thread/turns/list` with `sortDirection: "desc"`. The first page includes the turn identified by the cursor.', "type": ["string", "null"] } }, "required": ["approvalPolicy", "approvalsReviewer", "cwd", "itemsBackwardsCursor", "model", "modelProvider", "reasoningEffort", "sandbox", "serviceTier", "thread", "turnsBackwardsCursor"], "title": "ThreadResumeResponse", "type": "object" };
var schema146 = { "description": "Initial collaboration mode to use when the TUI starts.", "enum": ["plan", "default"], "type": "string" };
var schema147 = { "description": "Settings for a collaboration mode.", "properties": { "developer_instructions": { "type": ["string", "null"] }, "model": { "type": "string" }, "reasoning_effort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] } }, "required": ["model"], "type": "object" };
function validate126(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.model === void 0 && (missing0 = "model")) {
        validate126.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.developer_instructions !== void 0) {
          let data0 = data.developer_instructions;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate126.errors = [{ instancePath: instancePath + "/developer_instructions", schemaPath: "#/properties/developer_instructions/type", keyword: "type", params: { type: schema147.properties.developer_instructions.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.model !== void 0) {
            const _errs3 = errors;
            if (typeof data.model !== "string") {
              validate126.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.reasoning_effort !== void 0) {
              let data2 = data.reasoning_effort;
              const _errs5 = errors;
              const _errs6 = errors;
              let valid1 = false;
              const _errs7 = errors;
              const _errs8 = errors;
              if (errors === _errs8) {
                if (typeof data2 === "string") {
                  if (func2(data2) < 1) {
                    const err0 = { instancePath: instancePath + "/reasoning_effort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                    if (vErrors === null) {
                      vErrors = [err0];
                    } else {
                      vErrors.push(err0);
                    }
                    errors++;
                  }
                } else {
                  const err1 = { instancePath: instancePath + "/reasoning_effort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err1];
                  } else {
                    vErrors.push(err1);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs7 === errors;
              valid1 = valid1 || _valid0;
              if (!valid1) {
                const _errs10 = errors;
                if (data2 !== null) {
                  const err2 = { instancePath: instancePath + "/reasoning_effort", schemaPath: "#/properties/reasoning_effort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err2];
                  } else {
                    vErrors.push(err2);
                  }
                  errors++;
                }
                var _valid0 = _errs10 === errors;
                valid1 = valid1 || _valid0;
              }
              if (!valid1) {
                const err3 = { instancePath: instancePath + "/reasoning_effort", schemaPath: "#/properties/reasoning_effort/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
                validate126.errors = vErrors;
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
          }
        }
      }
    } else {
      validate126.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate126.errors = vErrors;
  return errors === 0;
}
function validate125(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.mode === void 0 && (missing0 = "mode") || data.settings === void 0 && (missing0 = "settings")) {
        validate125.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.mode !== void 0) {
          let data0 = data.mode;
          const _errs1 = errors;
          if (typeof data0 !== "string") {
            validate125.errors = [{ instancePath: instancePath + "/mode", schemaPath: "#/definitions/v2/ModeKind/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "plan" || data0 === "default")) {
            validate125.errors = [{ instancePath: instancePath + "/mode", schemaPath: "#/definitions/v2/ModeKind/enum", keyword: "enum", params: { allowedValues: schema146.enum } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.settings !== void 0) {
            const _errs4 = errors;
            if (!validate126(data.settings, { instancePath: instancePath + "/settings", parentData: data, parentDataProperty: "settings", rootData })) {
              vErrors = vErrors === null ? validate126.errors : vErrors.concat(validate126.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs4 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate125.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate125.errors = vErrors;
  return errors === 0;
}
function validate124(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.approvalPolicy === void 0 && (missing0 = "approvalPolicy") || data.approvalsReviewer === void 0 && (missing0 = "approvalsReviewer") || data.cwd === void 0 && (missing0 = "cwd") || data.itemsBackwardsCursor === void 0 && (missing0 = "itemsBackwardsCursor") || data.model === void 0 && (missing0 = "model") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.reasoningEffort === void 0 && (missing0 = "reasoningEffort") || data.sandbox === void 0 && (missing0 = "sandbox") || data.serviceTier === void 0 && (missing0 = "serviceTier") || data.thread === void 0 && (missing0 = "thread") || data.turnsBackwardsCursor === void 0 && (missing0 = "turnsBackwardsCursor")) {
        validate124.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema33.oneOf[0].enum } };
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
            validate124.errors = vErrors;
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
              validate124.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              validate124.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema34.enum } }];
              return false;
            }
            var valid0 = _errs21 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.collaborationMode !== void 0) {
              let data8 = data.collaborationMode;
              const _errs25 = errors;
              const _errs26 = errors;
              let valid7 = false;
              const _errs27 = errors;
              if (!validate125(data8, { instancePath: instancePath + "/collaborationMode", parentData: data, parentDataProperty: "collaborationMode", rootData })) {
                vErrors = vErrors === null ? validate125.errors : vErrors.concat(validate125.errors);
                errors = vErrors.length;
              }
              var _valid1 = _errs27 === errors;
              valid7 = valid7 || _valid1;
              if (!valid7) {
                const _errs28 = errors;
                if (data8 !== null) {
                  const err13 = { instancePath: instancePath + "/collaborationMode", schemaPath: "#/properties/collaborationMode/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                var _valid1 = _errs28 === errors;
                valid7 = valid7 || _valid1;
              }
              if (!valid7) {
                const err14 = { instancePath: instancePath + "/collaborationMode", schemaPath: "#/properties/collaborationMode/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
                validate124.errors = vErrors;
                return false;
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
              var valid0 = _errs25 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.cwd !== void 0) {
                const _errs30 = errors;
                if (typeof data.cwd !== "string") {
                  validate124.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                  return false;
                }
                var valid0 = _errs30 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.disabledPluginIds !== void 0) {
                  let data10 = data.disabledPluginIds;
                  const _errs33 = errors;
                  if (errors === _errs33) {
                    if (Array.isArray(data10)) {
                      var valid9 = true;
                      const len0 = data10.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs35 = errors;
                        if (typeof data10[i0] !== "string") {
                          validate124.errors = [{ instancePath: instancePath + "/disabledPluginIds/" + i0, schemaPath: "#/properties/disabledPluginIds/items/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        var valid9 = _errs35 === errors;
                        if (!valid9) {
                          break;
                        }
                      }
                    } else {
                      validate124.errors = [{ instancePath: instancePath + "/disabledPluginIds", schemaPath: "#/properties/disabledPluginIds/type", keyword: "type", params: { type: "array" } }];
                      return false;
                    }
                  }
                  var valid0 = _errs33 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.instructionSources !== void 0) {
                    let data12 = data.instructionSources;
                    const _errs37 = errors;
                    if (errors === _errs37) {
                      if (Array.isArray(data12)) {
                        var valid10 = true;
                        const len1 = data12.length;
                        for (let i1 = 0; i1 < len1; i1++) {
                          const _errs39 = errors;
                          if (typeof data12[i1] !== "string") {
                            validate124.errors = [{ instancePath: instancePath + "/instructionSources/" + i1, schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          var valid10 = _errs39 === errors;
                          if (!valid10) {
                            break;
                          }
                        }
                      } else {
                        validate124.errors = [{ instancePath: instancePath + "/instructionSources", schemaPath: "#/properties/instructionSources/type", keyword: "type", params: { type: "array" } }];
                        return false;
                      }
                    }
                    var valid0 = _errs37 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.itemsBackwardsCursor !== void 0) {
                      let data14 = data.itemsBackwardsCursor;
                      const _errs42 = errors;
                      if (typeof data14 !== "string" && data14 !== null) {
                        validate124.errors = [{ instancePath: instancePath + "/itemsBackwardsCursor", schemaPath: "#/properties/itemsBackwardsCursor/type", keyword: "type", params: { type: schema142.properties.itemsBackwardsCursor.type } }];
                        return false;
                      }
                      var valid0 = _errs42 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.model !== void 0) {
                        const _errs44 = errors;
                        if (typeof data.model !== "string") {
                          validate124.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        var valid0 = _errs44 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.modelProvider !== void 0) {
                          const _errs46 = errors;
                          if (typeof data.modelProvider !== "string") {
                            validate124.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          var valid0 = _errs46 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.reasoningEffort !== void 0) {
                            let data17 = data.reasoningEffort;
                            const _errs48 = errors;
                            const _errs49 = errors;
                            let valid12 = false;
                            const _errs50 = errors;
                            const _errs51 = errors;
                            if (errors === _errs51) {
                              if (typeof data17 === "string") {
                                if (func2(data17) < 1) {
                                  const err15 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                                  if (vErrors === null) {
                                    vErrors = [err15];
                                  } else {
                                    vErrors.push(err15);
                                  }
                                  errors++;
                                }
                              } else {
                                const err16 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err16];
                                } else {
                                  vErrors.push(err16);
                                }
                                errors++;
                              }
                            }
                            var _valid2 = _errs50 === errors;
                            valid12 = valid12 || _valid2;
                            if (!valid12) {
                              const _errs53 = errors;
                              if (data17 !== null) {
                                const err17 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                if (vErrors === null) {
                                  vErrors = [err17];
                                } else {
                                  vErrors.push(err17);
                                }
                                errors++;
                              }
                              var _valid2 = _errs53 === errors;
                              valid12 = valid12 || _valid2;
                            }
                            if (!valid12) {
                              const err18 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                              if (vErrors === null) {
                                vErrors = [err18];
                              } else {
                                vErrors.push(err18);
                              }
                              errors++;
                              validate124.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs49;
                              if (vErrors !== null) {
                                if (_errs49) {
                                  vErrors.length = _errs49;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs48 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.sandbox !== void 0) {
                              const _errs55 = errors;
                              if (!validate29(data.sandbox, { instancePath: instancePath + "/sandbox", parentData: data, parentDataProperty: "sandbox", rootData })) {
                                vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs55 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.serviceTier !== void 0) {
                                let data19 = data.serviceTier;
                                const _errs57 = errors;
                                if (typeof data19 !== "string" && data19 !== null) {
                                  validate124.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema142.properties.serviceTier.type } }];
                                  return false;
                                }
                                var valid0 = _errs57 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.thread !== void 0) {
                                  const _errs59 = errors;
                                  if (!validate31(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                                    vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid0 = _errs59 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.turnsBackwardsCursor !== void 0) {
                                    let data21 = data.turnsBackwardsCursor;
                                    const _errs60 = errors;
                                    if (typeof data21 !== "string" && data21 !== null) {
                                      validate124.errors = [{ instancePath: instancePath + "/turnsBackwardsCursor", schemaPath: "#/properties/turnsBackwardsCursor/type", keyword: "type", params: { type: schema142.properties.turnsBackwardsCursor.type } }];
                                      return false;
                                    }
                                    var valid0 = _errs60 === errors;
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
    } else {
      validate124.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate124.errors = vErrors;
  return errors === 0;
}
function validate123(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate124(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
    errors = vErrors.length;
  }
  validate123.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadStartResponse = validate132;
var schema153 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "$ref": "#/definitions/v2/AskForApproval" }, "approvalsReviewer": { "allOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }], "description": "Reviewer currently used for approval requests on this thread." }, "cwd": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "disabledPluginIds": { "default": [], "description": "Saved list of disabled plugin IDs. Does not yet filter plugin capabilities.", "items": { "type": "string" }, "type": "array" }, "instructionSources": { "default": [], "description": "Environment-native paths to instruction source files currently loaded for this thread.", "items": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": "array" }, "model": { "type": "string" }, "modelProvider": { "type": "string" }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] }, "sandbox": { "allOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }], "description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance." }, "serviceTier": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" } }, "required": ["approvalPolicy", "approvalsReviewer", "cwd", "model", "modelProvider", "reasoningEffort", "sandbox", "serviceTier", "thread"], "title": "ThreadStartResponse", "type": "object" };
function validate133(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.approvalPolicy === void 0 && (missing0 = "approvalPolicy") || data.approvalsReviewer === void 0 && (missing0 = "approvalsReviewer") || data.cwd === void 0 && (missing0 = "cwd") || data.model === void 0 && (missing0 = "model") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.reasoningEffort === void 0 && (missing0 = "reasoningEffort") || data.sandbox === void 0 && (missing0 = "sandbox") || data.serviceTier === void 0 && (missing0 = "serviceTier") || data.thread === void 0 && (missing0 = "thread")) {
        validate133.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema33.oneOf[0].enum } };
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
            validate133.errors = vErrors;
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
              validate133.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              validate133.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema34.enum } }];
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
                validate133.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs25 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.disabledPluginIds !== void 0) {
                let data9 = data.disabledPluginIds;
                const _errs28 = errors;
                if (errors === _errs28) {
                  if (Array.isArray(data9)) {
                    var valid8 = true;
                    const len0 = data9.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      const _errs30 = errors;
                      if (typeof data9[i0] !== "string") {
                        validate133.errors = [{ instancePath: instancePath + "/disabledPluginIds/" + i0, schemaPath: "#/properties/disabledPluginIds/items/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid8 = _errs30 === errors;
                      if (!valid8) {
                        break;
                      }
                    }
                  } else {
                    validate133.errors = [{ instancePath: instancePath + "/disabledPluginIds", schemaPath: "#/properties/disabledPluginIds/type", keyword: "type", params: { type: "array" } }];
                    return false;
                  }
                }
                var valid0 = _errs28 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.instructionSources !== void 0) {
                  let data11 = data.instructionSources;
                  const _errs32 = errors;
                  if (errors === _errs32) {
                    if (Array.isArray(data11)) {
                      var valid9 = true;
                      const len1 = data11.length;
                      for (let i1 = 0; i1 < len1; i1++) {
                        const _errs34 = errors;
                        if (typeof data11[i1] !== "string") {
                          validate133.errors = [{ instancePath: instancePath + "/instructionSources/" + i1, schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        var valid9 = _errs34 === errors;
                        if (!valid9) {
                          break;
                        }
                      }
                    } else {
                      validate133.errors = [{ instancePath: instancePath + "/instructionSources", schemaPath: "#/properties/instructionSources/type", keyword: "type", params: { type: "array" } }];
                      return false;
                    }
                  }
                  var valid0 = _errs32 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.model !== void 0) {
                    const _errs37 = errors;
                    if (typeof data.model !== "string") {
                      validate133.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid0 = _errs37 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.modelProvider !== void 0) {
                      const _errs39 = errors;
                      if (typeof data.modelProvider !== "string") {
                        validate133.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid0 = _errs39 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.reasoningEffort !== void 0) {
                        let data15 = data.reasoningEffort;
                        const _errs41 = errors;
                        const _errs42 = errors;
                        let valid11 = false;
                        const _errs43 = errors;
                        const _errs44 = errors;
                        if (errors === _errs44) {
                          if (typeof data15 === "string") {
                            if (func2(data15) < 1) {
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
                        var _valid1 = _errs43 === errors;
                        valid11 = valid11 || _valid1;
                        if (!valid11) {
                          const _errs46 = errors;
                          if (data15 !== null) {
                            const err15 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err15];
                            } else {
                              vErrors.push(err15);
                            }
                            errors++;
                          }
                          var _valid1 = _errs46 === errors;
                          valid11 = valid11 || _valid1;
                        }
                        if (!valid11) {
                          const err16 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                          if (vErrors === null) {
                            vErrors = [err16];
                          } else {
                            vErrors.push(err16);
                          }
                          errors++;
                          validate133.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs42;
                          if (vErrors !== null) {
                            if (_errs42) {
                              vErrors.length = _errs42;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid0 = _errs41 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.sandbox !== void 0) {
                          const _errs48 = errors;
                          if (!validate29(data.sandbox, { instancePath: instancePath + "/sandbox", parentData: data, parentDataProperty: "sandbox", rootData })) {
                            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs48 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.serviceTier !== void 0) {
                            let data17 = data.serviceTier;
                            const _errs50 = errors;
                            if (typeof data17 !== "string" && data17 !== null) {
                              validate133.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema153.properties.serviceTier.type } }];
                              return false;
                            }
                            var valid0 = _errs50 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.thread !== void 0) {
                              const _errs52 = errors;
                              if (!validate31(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                                vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs52 === errors;
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
    } else {
      validate133.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate133.errors = vErrors;
  return errors === 0;
}
function validate132(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate133(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate133.errors : vErrors.concat(validate133.errors);
    errors = vErrors.length;
  }
  validate132.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadStatusChangedNotification = validate137;
function validate138(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate138.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.status !== void 0) {
          const _errs1 = errors;
          if (!validate38(data.status, { instancePath: instancePath + "/status", parentData: data, parentDataProperty: "status", rootData })) {
            vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.threadId !== void 0) {
            const _errs2 = errors;
            if (typeof data.threadId !== "string") {
              validate138.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate138.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate138.errors = vErrors;
  return errors === 0;
}
function validate137(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate138(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate138.errors : vErrors.concat(validate138.errors);
    errors = vErrors.length;
  }
  validate137.errors = vErrors;
  return errors === 0;
}
var validateV2TurnError = validate141;
function validate142(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = "message")) {
        validate142.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.additionalDetails !== void 0) {
          let data0 = data.additionalDetails;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate142.errors = [{ instancePath: instancePath + "/additionalDetails", schemaPath: "#/properties/additionalDetails/type", keyword: "type", params: { type: schema56.properties.additionalDetails.type } }];
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
            if (!validate42(data1, { instancePath: instancePath + "/codexErrorInfo", parentData: data, parentDataProperty: "codexErrorInfo", rootData })) {
              vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
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
              validate142.errors = vErrors;
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
                validate142.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" } }];
                return false;
              }
              var valid0 = _errs8 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.misalignment !== void 0) {
                let data3 = data.misalignment;
                const _errs10 = errors;
                const _errs11 = errors;
                let valid2 = false;
                const _errs12 = errors;
                if (!validate44(data3, { instancePath: instancePath + "/misalignment", parentData: data, parentDataProperty: "misalignment", rootData })) {
                  vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
                  errors = vErrors.length;
                }
                var _valid1 = _errs12 === errors;
                valid2 = valid2 || _valid1;
                if (!valid2) {
                  const _errs13 = errors;
                  if (data3 !== null) {
                    const err2 = { instancePath: instancePath + "/misalignment", schemaPath: "#/properties/misalignment/anyOf/1/type", keyword: "type", params: { type: "null" } };
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
                  const err3 = { instancePath: instancePath + "/misalignment", schemaPath: "#/properties/misalignment/anyOf", keyword: "anyOf", params: {} };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                  validate142.errors = vErrors;
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
            }
          }
        }
      }
    } else {
      validate142.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate142.errors = vErrors;
  return errors === 0;
}
function validate141(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate142(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate142.errors : vErrors.concat(validate142.errors);
    errors = vErrors.length;
  }
  validate141.errors = vErrors;
  return errors === 0;
}
var validateV2TurnInterruptParams = validate146;
function validate146(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  if (errors === _errs0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate146.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptParams/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs2 = errors;
          if (typeof data.threadId !== "string") {
            validate146.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptParams/properties/threadId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid1 = _errs2 === errors;
        } else {
          var valid1 = true;
        }
        if (valid1) {
          if (data.turnId !== void 0) {
            const _errs4 = errors;
            if (typeof data.turnId !== "string") {
              validate146.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptParams/properties/turnId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid1 = _errs4 === errors;
          } else {
            var valid1 = true;
          }
        }
      }
    } else {
      validate146.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptParams/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate146.errors = vErrors;
  return errors === 0;
}
var validateV2TurnInterruptResponse = validate147;
function validate147(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    validate147.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptResponse/type", keyword: "type", params: { type: "object" } }];
    return false;
  }
  validate147.errors = vErrors;
  return errors === 0;
}
var validateV2TurnStartParams = validate148;
var schema168 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "anyOf": [{ "$ref": "#/definitions/v2/AskForApproval" }, { "type": "null" }], "description": "Override the approval policy for this turn and subsequent turns." }, "approvalsReviewer": { "anyOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }, { "type": "null" }], "description": "Override where approval requests are routed for review on this turn and subsequent turns." }, "clientUserMessageId": { "type": ["string", "null"] }, "cwd": { "description": "Override the working directory for this turn and subsequent turns.", "type": ["string", "null"] }, "disabledPluginIds": { "description": "Replace this thread's disabled plugin IDs. Omitted/null preserves the list; [] clears it.", "items": { "type": "string" }, "type": ["array", "null"] }, "effort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }], "description": "Override the reasoning effort for this turn and subsequent turns." }, "input": { "items": { "$ref": "#/definitions/v2/UserInput" }, "type": "array" }, "model": { "description": "Override the model for this turn and subsequent turns.", "type": ["string", "null"] }, "outputSchema": { "description": "Optional JSON Schema used to constrain the final assistant message for this turn." }, "personality": { "anyOf": [{ "$ref": "#/definitions/v2/Personality" }, { "type": "null" }], "description": "@deprecated `friendly` and `pragmatic` no longer select a style. Changing this does not rewrite the thread's existing instructions." }, "sandboxPolicy": { "anyOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }, { "type": "null" }], "description": "Override the sandbox policy for this turn and subsequent turns." }, "serviceTier": { "description": "Override the service tier for this turn and subsequent turns.", "type": ["string", "null"] }, "serviceTierForTurn": { "description": `Override the service tier only when this request starts a new turn. Use "default" for standard speed. Omitted or null inherits the thread's tier. Does not change the thread's tier or a turn being steered.`, "type": ["string", "null"] }, "summary": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningSummary" }, { "type": "null" }], "description": "Override the reasoning summary for this turn and subsequent turns." }, "threadId": { "type": "string" }, "toolOutput": { "anyOf": [{ "$ref": "#/definitions/v2/TurnToolOutput" }, { "type": "null" }] }, "turnTrigger": { "description": "Optional source classification for the caller that starts this turn. Ignored when this request steers an already-active turn.", "type": ["string", "null"] } }, "required": ["input", "threadId"], "title": "TurnStartParams", "type": "object" };
var schema172 = { "description": "Deprecated: `friendly` and `pragmatic` no longer select a style.", "enum": ["none", "friendly", "pragmatic"], "type": "string" };
var schema173 = { "description": "A summary of the reasoning performed by the model. This can be useful for debugging and understanding the model's reasoning process. See https://platform.openai.com/docs/guides/reasoning?api-mode=responses#reasoning-summaries", "oneOf": [{ "enum": ["auto", "concise", "detailed"], "type": "string" }, { "description": "Option to disable reasoning summaries.", "enum": ["none"], "type": "string" }] };
var schema174 = { "properties": { "name": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "output": { "$ref": "#/definitions/v2/FunctionCallOutputBody" } }, "required": ["name", "output"], "type": "object" };
function validate152(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.name === void 0 && (missing0 = "name") || data.output === void 0 && (missing0 = "output")) {
        validate152.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.name !== void 0) {
          const _errs1 = errors;
          if (typeof data.name !== "string") {
            validate152.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.namespace !== void 0) {
            let data1 = data.namespace;
            const _errs3 = errors;
            if (typeof data1 !== "string" && data1 !== null) {
              validate152.errors = [{ instancePath: instancePath + "/namespace", schemaPath: "#/properties/namespace/type", keyword: "type", params: { type: schema174.properties.namespace.type } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.output !== void 0) {
              const _errs5 = errors;
              if (!validate54(data.output, { instancePath: instancePath + "/output", parentData: data, parentDataProperty: "output", rootData })) {
                vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
          }
        }
      }
    } else {
      validate152.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate152.errors = vErrors;
  return errors === 0;
}
function validate149(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.input === void 0 && (missing0 = "input") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate149.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.approvalPolicy !== void 0) {
          let data0 = data.approvalPolicy;
          const _errs1 = errors;
          const _errs2 = errors;
          let valid1 = false;
          const _errs3 = errors;
          const _errs5 = errors;
          let valid3 = false;
          let passing0 = null;
          const _errs6 = errors;
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
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema33.oneOf[0].enum } };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
          var _valid1 = _errs6 === errors;
          if (_valid1) {
            valid3 = true;
            passing0 = 0;
          }
          const _errs8 = errors;
          if (errors === _errs8) {
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
                const _errs10 = errors;
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
                if (_errs10 === errors) {
                  if (data0.granular !== void 0) {
                    let data1 = data0.granular;
                    const _errs11 = errors;
                    if (errors === _errs11) {
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
                            const _errs13 = errors;
                            if (typeof data1.mcp_elicitations !== "boolean") {
                              const err5 = { instancePath: instancePath + "/approvalPolicy/granular/mcp_elicitations", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/mcp_elicitations/type", keyword: "type", params: { type: "boolean" } };
                              if (vErrors === null) {
                                vErrors = [err5];
                              } else {
                                vErrors.push(err5);
                              }
                              errors++;
                            }
                            var valid5 = _errs13 === errors;
                          } else {
                            var valid5 = true;
                          }
                          if (valid5) {
                            if (data1.request_permissions !== void 0) {
                              const _errs15 = errors;
                              if (typeof data1.request_permissions !== "boolean") {
                                const err6 = { instancePath: instancePath + "/approvalPolicy/granular/request_permissions", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/request_permissions/type", keyword: "type", params: { type: "boolean" } };
                                if (vErrors === null) {
                                  vErrors = [err6];
                                } else {
                                  vErrors.push(err6);
                                }
                                errors++;
                              }
                              var valid5 = _errs15 === errors;
                            } else {
                              var valid5 = true;
                            }
                            if (valid5) {
                              if (data1.rules !== void 0) {
                                const _errs17 = errors;
                                if (typeof data1.rules !== "boolean") {
                                  const err7 = { instancePath: instancePath + "/approvalPolicy/granular/rules", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/rules/type", keyword: "type", params: { type: "boolean" } };
                                  if (vErrors === null) {
                                    vErrors = [err7];
                                  } else {
                                    vErrors.push(err7);
                                  }
                                  errors++;
                                }
                                var valid5 = _errs17 === errors;
                              } else {
                                var valid5 = true;
                              }
                              if (valid5) {
                                if (data1.sandbox_approval !== void 0) {
                                  const _errs19 = errors;
                                  if (typeof data1.sandbox_approval !== "boolean") {
                                    const err8 = { instancePath: instancePath + "/approvalPolicy/granular/sandbox_approval", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/sandbox_approval/type", keyword: "type", params: { type: "boolean" } };
                                    if (vErrors === null) {
                                      vErrors = [err8];
                                    } else {
                                      vErrors.push(err8);
                                    }
                                    errors++;
                                  }
                                  var valid5 = _errs19 === errors;
                                } else {
                                  var valid5 = true;
                                }
                                if (valid5) {
                                  if (data1.skill_approval !== void 0) {
                                    const _errs21 = errors;
                                    if (typeof data1.skill_approval !== "boolean") {
                                      const err9 = { instancePath: instancePath + "/approvalPolicy/granular/skill_approval", schemaPath: "#/definitions/v2/AskForApproval/oneOf/1/properties/granular/properties/skill_approval/type", keyword: "type", params: { type: "boolean" } };
                                      if (vErrors === null) {
                                        vErrors = [err9];
                                      } else {
                                        vErrors.push(err9);
                                      }
                                      errors++;
                                    }
                                    var valid5 = _errs21 === errors;
                                  } else {
                                    var valid5 = true;
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
          var _valid1 = _errs8 === errors;
          if (_valid1 && valid3) {
            valid3 = false;
            passing0 = [passing0, 1];
          } else {
            if (_valid1) {
              valid3 = true;
              passing0 = 1;
            }
          }
          if (!valid3) {
            const err12 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
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
          var _valid0 = _errs3 === errors;
          valid1 = valid1 || _valid0;
          if (!valid1) {
            const _errs23 = errors;
            if (data0 !== null) {
              const err13 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/properties/approvalPolicy/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            var _valid0 = _errs23 === errors;
            valid1 = valid1 || _valid0;
          }
          if (!valid1) {
            const err14 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/properties/approvalPolicy/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
            validate149.errors = vErrors;
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
          if (data.approvalsReviewer !== void 0) {
            let data7 = data.approvalsReviewer;
            const _errs25 = errors;
            const _errs26 = errors;
            let valid6 = false;
            const _errs27 = errors;
            if (typeof data7 !== "string") {
              const err15 = { instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              const err16 = { instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema34.enum } };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            var _valid2 = _errs27 === errors;
            valid6 = valid6 || _valid2;
            if (!valid6) {
              const _errs30 = errors;
              if (data7 !== null) {
                const err17 = { instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/properties/approvalsReviewer/anyOf/1/type", keyword: "type", params: { type: "null" } };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              var _valid2 = _errs30 === errors;
              valid6 = valid6 || _valid2;
            }
            if (!valid6) {
              const err18 = { instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/properties/approvalsReviewer/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
              validate149.errors = vErrors;
              return false;
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
            var valid0 = _errs25 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.clientUserMessageId !== void 0) {
              let data8 = data.clientUserMessageId;
              const _errs32 = errors;
              if (typeof data8 !== "string" && data8 !== null) {
                validate149.errors = [{ instancePath: instancePath + "/clientUserMessageId", schemaPath: "#/properties/clientUserMessageId/type", keyword: "type", params: { type: schema168.properties.clientUserMessageId.type } }];
                return false;
              }
              var valid0 = _errs32 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.cwd !== void 0) {
                let data9 = data.cwd;
                const _errs34 = errors;
                if (typeof data9 !== "string" && data9 !== null) {
                  validate149.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/properties/cwd/type", keyword: "type", params: { type: schema168.properties.cwd.type } }];
                  return false;
                }
                var valid0 = _errs34 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.disabledPluginIds !== void 0) {
                  let data10 = data.disabledPluginIds;
                  const _errs36 = errors;
                  if (!Array.isArray(data10) && data10 !== null) {
                    validate149.errors = [{ instancePath: instancePath + "/disabledPluginIds", schemaPath: "#/properties/disabledPluginIds/type", keyword: "type", params: { type: schema168.properties.disabledPluginIds.type } }];
                    return false;
                  }
                  if (errors === _errs36) {
                    if (Array.isArray(data10)) {
                      var valid8 = true;
                      const len0 = data10.length;
                      for (let i0 = 0; i0 < len0; i0++) {
                        const _errs38 = errors;
                        if (typeof data10[i0] !== "string") {
                          validate149.errors = [{ instancePath: instancePath + "/disabledPluginIds/" + i0, schemaPath: "#/properties/disabledPluginIds/items/type", keyword: "type", params: { type: "string" } }];
                          return false;
                        }
                        var valid8 = _errs38 === errors;
                        if (!valid8) {
                          break;
                        }
                      }
                    }
                  }
                  var valid0 = _errs36 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.effort !== void 0) {
                    let data12 = data.effort;
                    const _errs40 = errors;
                    const _errs41 = errors;
                    let valid9 = false;
                    const _errs42 = errors;
                    const _errs43 = errors;
                    if (errors === _errs43) {
                      if (typeof data12 === "string") {
                        if (func2(data12) < 1) {
                          const err19 = { instancePath: instancePath + "/effort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                          if (vErrors === null) {
                            vErrors = [err19];
                          } else {
                            vErrors.push(err19);
                          }
                          errors++;
                        }
                      } else {
                        const err20 = { instancePath: instancePath + "/effort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err20];
                        } else {
                          vErrors.push(err20);
                        }
                        errors++;
                      }
                    }
                    var _valid3 = _errs42 === errors;
                    valid9 = valid9 || _valid3;
                    if (!valid9) {
                      const _errs45 = errors;
                      if (data12 !== null) {
                        const err21 = { instancePath: instancePath + "/effort", schemaPath: "#/properties/effort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                        if (vErrors === null) {
                          vErrors = [err21];
                        } else {
                          vErrors.push(err21);
                        }
                        errors++;
                      }
                      var _valid3 = _errs45 === errors;
                      valid9 = valid9 || _valid3;
                    }
                    if (!valid9) {
                      const err22 = { instancePath: instancePath + "/effort", schemaPath: "#/properties/effort/anyOf", keyword: "anyOf", params: {} };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                      validate149.errors = vErrors;
                      return false;
                    } else {
                      errors = _errs41;
                      if (vErrors !== null) {
                        if (_errs41) {
                          vErrors.length = _errs41;
                        } else {
                          vErrors = null;
                        }
                      }
                    }
                    var valid0 = _errs40 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.input !== void 0) {
                      let data13 = data.input;
                      const _errs47 = errors;
                      if (errors === _errs47) {
                        if (Array.isArray(data13)) {
                          var valid11 = true;
                          const len1 = data13.length;
                          for (let i1 = 0; i1 < len1; i1++) {
                            const _errs49 = errors;
                            if (!validate48(data13[i1], { instancePath: instancePath + "/input/" + i1, parentData: data13, parentDataProperty: i1, rootData })) {
                              vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
                              errors = vErrors.length;
                            }
                            var valid11 = _errs49 === errors;
                            if (!valid11) {
                              break;
                            }
                          }
                        } else {
                          validate149.errors = [{ instancePath: instancePath + "/input", schemaPath: "#/properties/input/type", keyword: "type", params: { type: "array" } }];
                          return false;
                        }
                      }
                      var valid0 = _errs47 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.model !== void 0) {
                        let data15 = data.model;
                        const _errs50 = errors;
                        if (typeof data15 !== "string" && data15 !== null) {
                          validate149.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: schema168.properties.model.type } }];
                          return false;
                        }
                        var valid0 = _errs50 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.personality !== void 0) {
                          let data16 = data.personality;
                          const _errs52 = errors;
                          const _errs53 = errors;
                          let valid12 = false;
                          const _errs54 = errors;
                          if (typeof data16 !== "string") {
                            const err23 = { instancePath: instancePath + "/personality", schemaPath: "#/definitions/v2/Personality/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err23];
                            } else {
                              vErrors.push(err23);
                            }
                            errors++;
                          }
                          if (!(data16 === "none" || data16 === "friendly" || data16 === "pragmatic")) {
                            const err24 = { instancePath: instancePath + "/personality", schemaPath: "#/definitions/v2/Personality/enum", keyword: "enum", params: { allowedValues: schema172.enum } };
                            if (vErrors === null) {
                              vErrors = [err24];
                            } else {
                              vErrors.push(err24);
                            }
                            errors++;
                          }
                          var _valid4 = _errs54 === errors;
                          valid12 = valid12 || _valid4;
                          if (!valid12) {
                            const _errs57 = errors;
                            if (data16 !== null) {
                              const err25 = { instancePath: instancePath + "/personality", schemaPath: "#/properties/personality/anyOf/1/type", keyword: "type", params: { type: "null" } };
                              if (vErrors === null) {
                                vErrors = [err25];
                              } else {
                                vErrors.push(err25);
                              }
                              errors++;
                            }
                            var _valid4 = _errs57 === errors;
                            valid12 = valid12 || _valid4;
                          }
                          if (!valid12) {
                            const err26 = { instancePath: instancePath + "/personality", schemaPath: "#/properties/personality/anyOf", keyword: "anyOf", params: {} };
                            if (vErrors === null) {
                              vErrors = [err26];
                            } else {
                              vErrors.push(err26);
                            }
                            errors++;
                            validate149.errors = vErrors;
                            return false;
                          } else {
                            errors = _errs53;
                            if (vErrors !== null) {
                              if (_errs53) {
                                vErrors.length = _errs53;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                          var valid0 = _errs52 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.sandboxPolicy !== void 0) {
                            let data17 = data.sandboxPolicy;
                            const _errs59 = errors;
                            const _errs60 = errors;
                            let valid14 = false;
                            const _errs61 = errors;
                            if (!validate29(data17, { instancePath: instancePath + "/sandboxPolicy", parentData: data, parentDataProperty: "sandboxPolicy", rootData })) {
                              vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                              errors = vErrors.length;
                            }
                            var _valid5 = _errs61 === errors;
                            valid14 = valid14 || _valid5;
                            if (!valid14) {
                              const _errs62 = errors;
                              if (data17 !== null) {
                                const err27 = { instancePath: instancePath + "/sandboxPolicy", schemaPath: "#/properties/sandboxPolicy/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                if (vErrors === null) {
                                  vErrors = [err27];
                                } else {
                                  vErrors.push(err27);
                                }
                                errors++;
                              }
                              var _valid5 = _errs62 === errors;
                              valid14 = valid14 || _valid5;
                            }
                            if (!valid14) {
                              const err28 = { instancePath: instancePath + "/sandboxPolicy", schemaPath: "#/properties/sandboxPolicy/anyOf", keyword: "anyOf", params: {} };
                              if (vErrors === null) {
                                vErrors = [err28];
                              } else {
                                vErrors.push(err28);
                              }
                              errors++;
                              validate149.errors = vErrors;
                              return false;
                            } else {
                              errors = _errs60;
                              if (vErrors !== null) {
                                if (_errs60) {
                                  vErrors.length = _errs60;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid0 = _errs59 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.serviceTier !== void 0) {
                              let data18 = data.serviceTier;
                              const _errs64 = errors;
                              if (typeof data18 !== "string" && data18 !== null) {
                                validate149.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema168.properties.serviceTier.type } }];
                                return false;
                              }
                              var valid0 = _errs64 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.serviceTierForTurn !== void 0) {
                                let data19 = data.serviceTierForTurn;
                                const _errs66 = errors;
                                if (typeof data19 !== "string" && data19 !== null) {
                                  validate149.errors = [{ instancePath: instancePath + "/serviceTierForTurn", schemaPath: "#/properties/serviceTierForTurn/type", keyword: "type", params: { type: schema168.properties.serviceTierForTurn.type } }];
                                  return false;
                                }
                                var valid0 = _errs66 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.summary !== void 0) {
                                  let data20 = data.summary;
                                  const _errs68 = errors;
                                  const _errs69 = errors;
                                  let valid15 = false;
                                  const _errs70 = errors;
                                  const _errs72 = errors;
                                  let valid17 = false;
                                  let passing1 = null;
                                  const _errs73 = errors;
                                  if (typeof data20 !== "string") {
                                    const err29 = { instancePath: instancePath + "/summary", schemaPath: "#/definitions/v2/ReasoningSummary/oneOf/0/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err29];
                                    } else {
                                      vErrors.push(err29);
                                    }
                                    errors++;
                                  }
                                  if (!(data20 === "auto" || data20 === "concise" || data20 === "detailed")) {
                                    const err30 = { instancePath: instancePath + "/summary", schemaPath: "#/definitions/v2/ReasoningSummary/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema173.oneOf[0].enum } };
                                    if (vErrors === null) {
                                      vErrors = [err30];
                                    } else {
                                      vErrors.push(err30);
                                    }
                                    errors++;
                                  }
                                  var _valid7 = _errs73 === errors;
                                  if (_valid7) {
                                    valid17 = true;
                                    passing1 = 0;
                                  }
                                  const _errs75 = errors;
                                  if (typeof data20 !== "string") {
                                    const err31 = { instancePath: instancePath + "/summary", schemaPath: "#/definitions/v2/ReasoningSummary/oneOf/1/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err31];
                                    } else {
                                      vErrors.push(err31);
                                    }
                                    errors++;
                                  }
                                  if (!(data20 === "none")) {
                                    const err32 = { instancePath: instancePath + "/summary", schemaPath: "#/definitions/v2/ReasoningSummary/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema173.oneOf[1].enum } };
                                    if (vErrors === null) {
                                      vErrors = [err32];
                                    } else {
                                      vErrors.push(err32);
                                    }
                                    errors++;
                                  }
                                  var _valid7 = _errs75 === errors;
                                  if (_valid7 && valid17) {
                                    valid17 = false;
                                    passing1 = [passing1, 1];
                                  } else {
                                    if (_valid7) {
                                      valid17 = true;
                                      passing1 = 1;
                                    }
                                  }
                                  if (!valid17) {
                                    const err33 = { instancePath: instancePath + "/summary", schemaPath: "#/definitions/v2/ReasoningSummary/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 } };
                                    if (vErrors === null) {
                                      vErrors = [err33];
                                    } else {
                                      vErrors.push(err33);
                                    }
                                    errors++;
                                  } else {
                                    errors = _errs72;
                                    if (vErrors !== null) {
                                      if (_errs72) {
                                        vErrors.length = _errs72;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var _valid6 = _errs70 === errors;
                                  valid15 = valid15 || _valid6;
                                  if (!valid15) {
                                    const _errs77 = errors;
                                    if (data20 !== null) {
                                      const err34 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                      if (vErrors === null) {
                                        vErrors = [err34];
                                      } else {
                                        vErrors.push(err34);
                                      }
                                      errors++;
                                    }
                                    var _valid6 = _errs77 === errors;
                                    valid15 = valid15 || _valid6;
                                  }
                                  if (!valid15) {
                                    const err35 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/anyOf", keyword: "anyOf", params: {} };
                                    if (vErrors === null) {
                                      vErrors = [err35];
                                    } else {
                                      vErrors.push(err35);
                                    }
                                    errors++;
                                    validate149.errors = vErrors;
                                    return false;
                                  } else {
                                    errors = _errs69;
                                    if (vErrors !== null) {
                                      if (_errs69) {
                                        vErrors.length = _errs69;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid0 = _errs68 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.threadId !== void 0) {
                                    const _errs79 = errors;
                                    if (typeof data.threadId !== "string") {
                                      validate149.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
                                      return false;
                                    }
                                    var valid0 = _errs79 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.toolOutput !== void 0) {
                                      let data22 = data.toolOutput;
                                      const _errs81 = errors;
                                      const _errs82 = errors;
                                      let valid18 = false;
                                      const _errs83 = errors;
                                      if (!validate152(data22, { instancePath: instancePath + "/toolOutput", parentData: data, parentDataProperty: "toolOutput", rootData })) {
                                        vErrors = vErrors === null ? validate152.errors : vErrors.concat(validate152.errors);
                                        errors = vErrors.length;
                                      }
                                      var _valid8 = _errs83 === errors;
                                      valid18 = valid18 || _valid8;
                                      if (!valid18) {
                                        const _errs84 = errors;
                                        if (data22 !== null) {
                                          const err36 = { instancePath: instancePath + "/toolOutput", schemaPath: "#/properties/toolOutput/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                          if (vErrors === null) {
                                            vErrors = [err36];
                                          } else {
                                            vErrors.push(err36);
                                          }
                                          errors++;
                                        }
                                        var _valid8 = _errs84 === errors;
                                        valid18 = valid18 || _valid8;
                                      }
                                      if (!valid18) {
                                        const err37 = { instancePath: instancePath + "/toolOutput", schemaPath: "#/properties/toolOutput/anyOf", keyword: "anyOf", params: {} };
                                        if (vErrors === null) {
                                          vErrors = [err37];
                                        } else {
                                          vErrors.push(err37);
                                        }
                                        errors++;
                                        validate149.errors = vErrors;
                                        return false;
                                      } else {
                                        errors = _errs82;
                                        if (vErrors !== null) {
                                          if (_errs82) {
                                            vErrors.length = _errs82;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid0 = _errs81 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.turnTrigger !== void 0) {
                                        let data23 = data.turnTrigger;
                                        const _errs86 = errors;
                                        if (typeof data23 !== "string" && data23 !== null) {
                                          validate149.errors = [{ instancePath: instancePath + "/turnTrigger", schemaPath: "#/properties/turnTrigger/type", keyword: "type", params: { type: schema168.properties.turnTrigger.type } }];
                                          return false;
                                        }
                                        var valid0 = _errs86 === errors;
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
    } else {
      validate149.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate149.errors = vErrors;
  return errors === 0;
}
function validate148(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate149(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate149.errors : vErrors.concat(validate149.errors);
    errors = vErrors.length;
  }
  validate148.errors = vErrors;
  return errors === 0;
}
var validateV2TurnStartResponse = validate156;
function validate157(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turn === void 0 && (missing0 = "turn")) {
        validate157.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.turn !== void 0) {
          if (!validate40(data.turn, { instancePath: instancePath + "/turn", parentData: data, parentDataProperty: "turn", rootData })) {
            vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
            errors = vErrors.length;
          }
        }
      }
    } else {
      validate157.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate157.errors = vErrors;
  return errors === 0;
}
function validate156(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate157(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate157.errors : vErrors.concat(validate157.errors);
    errors = vErrors.length;
  }
  validate156.errors = vErrors;
  return errors === 0;
}
var validateV2TurnSteerParams = validate160;
var schema178 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "clientUserMessageId": { "type": ["string", "null"] }, "expectedTurnId": { "description": "Required active turn id precondition. The request fails when it does not match the currently active turn.", "type": "string" }, "input": { "items": { "$ref": "#/definitions/v2/UserInput" }, "type": "array" }, "threadId": { "type": "string" } }, "required": ["expectedTurnId", "input", "threadId"], "title": "TurnSteerParams", "type": "object" };
function validate161(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.expectedTurnId === void 0 && (missing0 = "expectedTurnId") || data.input === void 0 && (missing0 = "input") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate161.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.clientUserMessageId !== void 0) {
          let data0 = data.clientUserMessageId;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate161.errors = [{ instancePath: instancePath + "/clientUserMessageId", schemaPath: "#/properties/clientUserMessageId/type", keyword: "type", params: { type: schema178.properties.clientUserMessageId.type } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.expectedTurnId !== void 0) {
            const _errs3 = errors;
            if (typeof data.expectedTurnId !== "string") {
              validate161.errors = [{ instancePath: instancePath + "/expectedTurnId", schemaPath: "#/properties/expectedTurnId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.input !== void 0) {
              let data2 = data.input;
              const _errs5 = errors;
              if (errors === _errs5) {
                if (Array.isArray(data2)) {
                  var valid1 = true;
                  const len0 = data2.length;
                  for (let i0 = 0; i0 < len0; i0++) {
                    const _errs7 = errors;
                    if (!validate48(data2[i0], { instancePath: instancePath + "/input/" + i0, parentData: data2, parentDataProperty: i0, rootData })) {
                      vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
                      errors = vErrors.length;
                    }
                    var valid1 = _errs7 === errors;
                    if (!valid1) {
                      break;
                    }
                  }
                } else {
                  validate161.errors = [{ instancePath: instancePath + "/input", schemaPath: "#/properties/input/type", keyword: "type", params: { type: "array" } }];
                  return false;
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.threadId !== void 0) {
                const _errs8 = errors;
                if (typeof data.threadId !== "string") {
                  validate161.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
    } else {
      validate161.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate161.errors = vErrors;
  return errors === 0;
}
function validate160(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate161(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate161.errors : vErrors.concat(validate161.errors);
    errors = vErrors.length;
  }
  validate160.errors = vErrors;
  return errors === 0;
}
var validateV2TurnSteerResponse = validate164;
function validate164(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  if (errors === _errs0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turnId === void 0 && (missing0 = "turnId")) {
        validate164.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.turnId !== void 0) {
          if (typeof data.turnId !== "string") {
            validate164.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/properties/turnId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
        }
      }
    } else {
      validate164.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate164.errors = vErrors;
  return errors === 0;
}
export {
  validateInitializeResponse,
  validateV2SkillsChangedNotification,
  validateV2SkillsListResponse,
  validateV2ThreadCompactStartResponse,
  validateV2ThreadForkResponse,
  validateV2ThreadListResponse,
  validateV2ThreadLoadedListResponse,
  validateV2ThreadProjectionAttachResponse,
  validateV2ThreadProjectionClosedNotification,
  validateV2ThreadProjectionDeltaNotification,
  validateV2ThreadProjectionDetachResponse,
  validateV2ThreadProjectionEventNotification,
  validateV2ThreadReadResponse,
  validateV2ThreadResumeResponse,
  validateV2ThreadStartResponse,
  validateV2ThreadStatusChangedNotification,
  validateV2TurnError,
  validateV2TurnInterruptParams,
  validateV2TurnInterruptResponse,
  validateV2TurnStartParams,
  validateV2TurnStartResponse,
  validateV2TurnSteerParams,
  validateV2TurnSteerResponse
};
