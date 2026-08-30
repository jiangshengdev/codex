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
var validateV2ThreadListResponse = validate26;
var schema30 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "backwardsCursor": { "description": "Opaque cursor to pass as `cursor` when reversing `sortDirection`. This is only populated when the page contains at least one thread. Use it with the opposite `sortDirection`; for timestamp sorts it anchors at the start of the page timestamp so same-second updates are not skipped.", "type": ["string", "null"] }, "data": { "items": { "$ref": "#/definitions/v2/Thread" }, "type": "array" }, "nextCursor": { "description": "Opaque cursor to pass to the next call to continue after the last item. if None, there are no more items to return.", "type": ["string", "null"] } }, "required": ["backwardsCursor", "data", "nextCursor"], "title": "ThreadListResponse", "type": "object" };
var schema31 = { "properties": { "agentNickname": { "description": "Optional random unique nickname assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "agentRole": { "description": "Optional role (agent_role) assigned to an AgentControl-spawned sub-agent.", "type": ["string", "null"] }, "cliVersion": { "description": "Version of the CLI that created the thread.", "type": "string" }, "createdAt": { "description": "Unix timestamp (in seconds) when the thread was created.", "format": "int64", "type": "integer" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }], "description": "Working directory captured for the thread." }, "ephemeral": { "description": "Whether the thread is ephemeral and should not be materialized on disk.", "type": "boolean" }, "forkedFromId": { "description": "Source thread id when this thread was created by forking another thread.", "type": ["string", "null"] }, "gitInfo": { "anyOf": [{ "$ref": "#/definitions/v2/GitInfo" }, { "type": "null" }], "description": "Optional Git metadata captured when the thread was created." }, "historyMode": { "allOf": [{ "$ref": "#/definitions/v2/ThreadHistoryMode" }], "default": "legacy", "description": "Persisted thread history contract selected when this thread was created." }, "id": { "description": "Identifier for this thread. Codex-generated thread IDs are UUIDv7.", "type": "string" }, "modelProvider": { "description": "Model provider used for this thread (for example, 'openai').", "type": "string" }, "name": { "description": "Optional user-facing thread title.", "type": ["string", "null"] }, "parentThreadId": { "description": "The ID of the parent thread. This will only be set if this thread is a subagent.", "type": ["string", "null"] }, "path": { "description": "[UNSTABLE] Path to the thread on disk.", "type": ["string", "null"] }, "preview": { "description": "Usually the first user message in the thread, if available.", "type": "string" }, "projectId": { "description": "Canonical project assignment owned by app-server, if any.", "type": ["string", "null"] }, "recencyAt": { "description": "Unix timestamp (in seconds) used for thread recency ordering.", "format": "int64", "type": ["integer", "null"] }, "section": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSection" }, { "type": "null" }], "default": null, "description": "The independently persisted section selected for this thread, if any." }, "sectionEnteredAt": { "default": null, "description": "Unix timestamp in seconds when the thread entered its current section.", "format": "int64", "type": ["integer", "null"] }, "sessionId": { "description": "Session id shared by threads that belong to the same session tree.", "type": "string" }, "source": { "allOf": [{ "$ref": "#/definitions/v2/SessionSource" }], "description": "Origin of the thread (CLI, VSCode, codex exec, codex app-server, etc.)." }, "status": { "allOf": [{ "$ref": "#/definitions/v2/ThreadStatus" }], "description": "Current runtime status for the thread." }, "threadSource": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadSource" }, { "type": "null" }], "description": "Optional analytics source classification for this thread." }, "turns": { "description": "Only populated on `thread/resume`, `thread/rollback`, `thread/fork`, and `thread/read` (when `includeTurns` is true) responses. For all other responses and notifications returning a Thread, the turns field will be an empty list.", "items": { "$ref": "#/definitions/v2/Turn" }, "type": "array" }, "updatedAt": { "description": "Unix timestamp (in seconds) when the thread was last updated.", "format": "int64", "type": "integer" } }, "required": ["cliVersion", "createdAt", "cwd", "ephemeral", "id", "modelProvider", "preview", "projectId", "sessionId", "source", "status", "turns", "updatedAt"], "type": "object" };
var schema33 = { "properties": { "branch": { "type": ["string", "null"] }, "originUrl": { "type": ["string", "null"] }, "sha": { "type": ["string", "null"] } }, "type": "object" };
var schema34 = { "enum": ["legacy", "paginated"], "type": "string" };
var schema36 = { "description": "Extensible visual presentation for a custom thread section.", "properties": { "color": { "type": ["string", "null"] }, "icon": { "type": ["string", "null"] } }, "type": "object" };
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
                  const err0 = { instancePath: instancePath + "/appearance/color", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/color/type", keyword: "type", params: { type: schema36.properties.color.type } };
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
                    const err1 = { instancePath: instancePath + "/appearance/icon", schemaPath: "#/definitions/v2/ThreadSectionAppearance/properties/icon/type", keyword: "type", params: { type: schema36.properties.icon.type } };
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
var schema37 = { "oneOf": [{ "enum": ["cli", "vscode", "exec", "appServer", "unknown"], "type": "string" }, { "additionalProperties": false, "properties": { "custom": { "type": "string" } }, "required": ["custom"], "title": "CustomSessionSource", "type": "object" }, { "additionalProperties": false, "properties": { "subAgent": { "$ref": "#/definitions/v2/SubAgentSource" } }, "required": ["subAgent"], "title": "SubAgentSessionSource", "type": "object" }] };
var schema38 = { "oneOf": [{ "enum": ["review", "compact", "memory_consolidation"], "type": "string" }, { "additionalProperties": false, "properties": { "thread_spawn": { "properties": { "agent_nickname": { "default": null, "type": ["string", "null"] }, "agent_path": { "anyOf": [{ "$ref": "#/definitions/v2/AgentPath" }, { "type": "null" }], "default": null }, "agent_role": { "default": null, "type": ["string", "null"] }, "depth": { "format": "int32", "type": "integer" }, "parent_thread_id": { "$ref": "#/definitions/v2/ThreadId" } }, "required": ["depth", "parent_thread_id"], "type": "object" } }, "required": ["thread_spawn"], "title": "ThreadSpawnSubAgentSource", "type": "object" }, { "additionalProperties": false, "properties": { "other": { "type": "string" } }, "required": ["other"], "title": "OtherSubAgentSource", "type": "object" }] };
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
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema38.oneOf[0].enum } };
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
                      const err5 = { instancePath: instancePath + "/thread_spawn/agent_nickname", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_nickname/type", keyword: "type", params: { type: schema38.oneOf[1].properties.thread_spawn.properties.agent_nickname.type } };
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
                          const err9 = { instancePath: instancePath + "/thread_spawn/agent_role", schemaPath: "#/oneOf/1/properties/thread_spawn/properties/agent_role/type", keyword: "type", params: { type: schema38.oneOf[1].properties.thread_spawn.properties.agent_role.type } };
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
var schema41 = { "oneOf": [{ "properties": { "type": { "enum": ["notLoaded"], "title": "NotLoadedThreadStatusType", "type": "string" } }, "required": ["type"], "title": "NotLoadedThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["idle"], "title": "IdleThreadStatusType", "type": "string" } }, "required": ["type"], "title": "IdleThreadStatus", "type": "object" }, { "properties": { "type": { "enum": ["systemError"], "title": "SystemErrorThreadStatusType", "type": "string" } }, "required": ["type"], "title": "SystemErrorThreadStatus", "type": "object" }, { "properties": { "activeFlags": { "items": { "$ref": "#/definitions/v2/ThreadActiveFlag" }, "type": "array" }, "type": { "enum": ["active"], "title": "ActiveThreadStatusType", "type": "string" } }, "required": ["activeFlags", "type"], "title": "ActiveThreadStatus", "type": "object" }] };
var schema42 = { "enum": ["waitingOnApproval", "waitingOnUserInput"], "type": "string" };
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
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema41.oneOf[0].properties.type.enum } };
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
            const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema41.oneOf[1].properties.type.enum } };
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
              const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema41.oneOf[2].properties.type.enum } };
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
                      const err14 = { instancePath: instancePath + "/activeFlags/" + i0, schemaPath: "#/definitions/v2/ThreadActiveFlag/enum", keyword: "enum", params: { allowedValues: schema42.enum } };
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
                  const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema41.oneOf[3].properties.type.enum } };
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
var schema44 = { "properties": { "completedAt": { "description": "Unix timestamp (in seconds) when the turn completed.", "format": "int64", "type": ["integer", "null"] }, "durationMs": { "description": "Duration between turn start and completion in milliseconds, if known.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/TurnError" }, { "type": "null" }], "description": "Only populated when the Turn's status is failed." }, "id": { "description": "Identifier for this turn. Codex-generated turn IDs are UUIDv7.", "type": "string" }, "items": { "description": "Thread items currently included in this turn payload.", "items": { "$ref": "#/definitions/v2/ThreadItem" }, "type": "array" }, "itemsView": { "allOf": [{ "$ref": "#/definitions/v2/TurnItemsView" }], "default": "full", "description": "Describes how much of `items` has been loaded for this turn." }, "startedAt": { "description": "Unix timestamp (in seconds) when the turn started.", "format": "int64", "type": ["integer", "null"] }, "status": { "$ref": "#/definitions/v2/TurnStatus" } }, "required": ["id", "items", "status"], "type": "object" };
var schema88 = { "oneOf": [{ "description": "`items` was not loaded for this turn. The field is intentionally empty.", "enum": ["notLoaded"], "type": "string" }, { "description": "`items` contains only a display summary for this turn.", "enum": ["summary"], "type": "string" }, { "description": "`items` contains every ThreadItem available from persisted app-server history for this turn.", "enum": ["full"], "type": "string" }] };
var schema89 = { "enum": ["completed", "interrupted", "failed", "inProgress"], "type": "string" };
var schema45 = { "properties": { "additionalDetails": { "default": null, "type": ["string", "null"] }, "codexErrorInfo": { "anyOf": [{ "$ref": "#/definitions/v2/CodexErrorInfo" }, { "type": "null" }] }, "message": { "type": "string" }, "misalignment": { "anyOf": [{ "$ref": "#/definitions/v2/MisalignmentErrorDetails" }, { "type": "null" }], "default": null, "description": "Optional public explanation and continuation instruction for a misalignment block." } }, "required": ["message"], "type": "object" };
var schema46 = { "description": "This translation layer make sure that we expose codex error code in camel case.\n\nWhen an upstream HTTP status is available (for example, from the Responses API or a provider), it is forwarded in `httpStatusCode` on the relevant `codexErrorInfo` variant.", "oneOf": [{ "enum": ["contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "rateLimitExceeded", "serverOverloaded", "cyberPolicy", "misalignmentPolicyViolation", "internalServerError", "unauthorized", "badRequest", "threadRollbackFailed", "sandboxError", "other"], "type": "string" }, { "additionalProperties": false, "properties": { "httpConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["httpConnectionFailed"], "title": "HttpConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Failed to connect to the response SSE stream.", "properties": { "responseStreamConnectionFailed": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamConnectionFailed"], "title": "ResponseStreamConnectionFailedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "The response SSE stream disconnected in the middle of a turn before completion.", "properties": { "responseStreamDisconnected": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseStreamDisconnected"], "title": "ResponseStreamDisconnectedCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Reached the retry limit for responses.", "properties": { "responseTooManyFailedAttempts": { "properties": { "httpStatusCode": { "format": "uint16", "minimum": 0, "type": ["integer", "null"] } }, "type": "object" } }, "required": ["responseTooManyFailedAttempts"], "title": "ResponseTooManyFailedAttemptsCodexErrorInfo", "type": "object" }, { "additionalProperties": false, "description": "Returned when `turn/start` or `turn/steer` is submitted while the current active turn cannot accept same-turn steering, for example `/review` or manual `/compact`.", "properties": { "activeTurnNotSteerable": { "properties": { "turnKind": { "$ref": "#/definitions/v2/NonSteerableTurnKind" } }, "required": ["turnKind"], "type": "object" } }, "required": ["activeTurnNotSteerable"], "title": "ActiveTurnNotSteerableCodexErrorInfo", "type": "object" }] };
var schema47 = { "enum": ["review", "compact"], "type": "string" };
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
  if (!(data === "contextWindowExceeded" || data === "sessionBudgetExceeded" || data === "usageLimitExceeded" || data === "rateLimitExceeded" || data === "serverOverloaded" || data === "cyberPolicy" || data === "misalignmentPolicyViolation" || data === "internalServerError" || data === "unauthorized" || data === "badRequest" || data === "threadRollbackFailed" || data === "sandboxError" || data === "other")) {
    const err1 = { instancePath, schemaPath: "#/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema46.oneOf[0].enum } };
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
                    const err4 = { instancePath: instancePath + "/httpConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/1/properties/httpConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema46.oneOf[1].properties.httpConnectionFailed.properties.httpStatusCode.type } };
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
                      const err10 = { instancePath: instancePath + "/responseStreamConnectionFailed/httpStatusCode", schemaPath: "#/oneOf/2/properties/responseStreamConnectionFailed/properties/httpStatusCode/type", keyword: "type", params: { type: schema46.oneOf[2].properties.responseStreamConnectionFailed.properties.httpStatusCode.type } };
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
                        const err16 = { instancePath: instancePath + "/responseStreamDisconnected/httpStatusCode", schemaPath: "#/oneOf/3/properties/responseStreamDisconnected/properties/httpStatusCode/type", keyword: "type", params: { type: schema46.oneOf[3].properties.responseStreamDisconnected.properties.httpStatusCode.type } };
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
                          const err22 = { instancePath: instancePath + "/responseTooManyFailedAttempts/httpStatusCode", schemaPath: "#/oneOf/4/properties/responseTooManyFailedAttempts/properties/httpStatusCode/type", keyword: "type", params: { type: schema46.oneOf[4].properties.responseTooManyFailedAttempts.properties.httpStatusCode.type } };
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
                              const err30 = { instancePath: instancePath + "/activeTurnNotSteerable/turnKind", schemaPath: "#/definitions/v2/NonSteerableTurnKind/enum", keyword: "enum", params: { allowedValues: schema47.enum } };
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
var schema48 = { "properties": { "detailedExplanation": { "description": "A substantive localized explanation is required before offering continuation.", "type": ["string", "null"] }, "errorType": { "description": "Open-ended classification; clients must accept categories added by Responses.", "type": ["string", "null"] }, "steer": { "anyOf": [{ "$ref": "#/definitions/v2/MisalignmentSteer" }, { "type": "null" }], "description": "Instruction to submit as the next turn's user input if continuation is confirmed." } }, "type": "object" };
function validate41(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.detailedExplanation !== void 0) {
        let data0 = data.detailedExplanation;
        const _errs1 = errors;
        if (typeof data0 !== "string" && data0 !== null) {
          validate41.errors = [{ instancePath: instancePath + "/detailedExplanation", schemaPath: "#/properties/detailedExplanation/type", keyword: "type", params: { type: schema48.properties.detailedExplanation.type } }];
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
            validate41.errors = [{ instancePath: instancePath + "/errorType", schemaPath: "#/properties/errorType/type", keyword: "type", params: { type: schema48.properties.errorType.type } }];
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
              validate41.errors = vErrors;
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
      validate41.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate41.errors = vErrors;
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
            validate38.errors = [{ instancePath: instancePath + "/additionalDetails", schemaPath: "#/properties/additionalDetails/type", keyword: "type", params: { type: schema45.properties.additionalDetails.type } }];
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
            if (valid0) {
              if (data.misalignment !== void 0) {
                let data3 = data.misalignment;
                const _errs10 = errors;
                const _errs11 = errors;
                let valid2 = false;
                const _errs12 = errors;
                if (!validate41(data3, { instancePath: instancePath + "/misalignment", parentData: data, parentDataProperty: "misalignment", rootData })) {
                  vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
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
                  validate38.errors = vErrors;
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
      validate38.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate38.errors = vErrors;
  return errors === 0;
}
var schema50 = { "oneOf": [{ "properties": { "clientId": { "type": ["string", "null"] }, "content": { "items": { "$ref": "#/definitions/v2/UserInput" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["userMessage"], "title": "UserMessageThreadItemType", "type": "string" } }, "required": ["content", "id", "type"], "title": "UserMessageThreadItem", "type": "object" }, { "properties": { "fragments": { "items": { "$ref": "#/definitions/v2/HookPromptFragment" }, "type": "array" }, "id": { "type": "string" }, "type": { "enum": ["hookPrompt"], "title": "HookPromptThreadItemType", "type": "string" } }, "required": ["fragments", "id", "type"], "title": "HookPromptThreadItem", "type": "object" }, { "properties": { "delivery": { "anyOf": [{ "$ref": "#/definitions/v2/AgentMessageDelivery" }, { "type": "null" }], "default": null }, "id": { "type": "string" }, "memoryCitation": { "anyOf": [{ "$ref": "#/definitions/v2/MemoryCitation" }, { "type": "null" }], "default": null }, "phase": { "anyOf": [{ "$ref": "#/definitions/v2/MessagePhase" }, { "type": "null" }], "default": null }, "text": { "type": "string" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "AgentMessageThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "output": { "$ref": "#/definitions/v2/FunctionCallOutputBody" }, "type": { "enum": ["functionCallOutput"], "title": "FunctionCallOutputThreadItemType", "type": "string" } }, "required": ["id", "name", "output", "type"], "title": "FunctionCallOutputThreadItem", "type": "object" }, { "description": "EXPERIMENTAL - proposed plan item content. The completed plan item is authoritative and may not match the concatenation of `PlanDelta` text.", "properties": { "id": { "type": "string" }, "text": { "type": "string" }, "type": { "enum": ["plan"], "title": "PlanThreadItemType", "type": "string" } }, "required": ["id", "text", "type"], "title": "PlanThreadItem", "type": "object" }, { "properties": { "content": { "default": [], "items": { "type": "string" }, "type": "array" }, "id": { "type": "string" }, "summary": { "default": [], "items": { "type": "string" }, "type": "array" }, "type": { "enum": ["reasoning"], "title": "ReasoningThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ReasoningThreadItem", "type": "object" }, { "properties": { "aggregatedOutput": { "description": "The command's output, aggregated from stdout and stderr.", "type": ["string", "null"] }, "command": { "description": "The command to be executed.", "type": "string" }, "commandActions": { "description": "A best-effort parsing of the command to understand the action(s) it will perform. This returns a list of CommandAction objects because a single shell command may be composed of many commands piped together.", "items": { "$ref": "#/definitions/v2/CommandAction" }, "type": "array" }, "cwd": { "allOf": [{ "$ref": "#/definitions/v2/LegacyAppPathString" }], "description": "The command's working directory." }, "durationMs": { "description": "The duration of the command execution in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "exitCode": { "description": "The command's exit code.", "format": "int32", "type": ["integer", "null"] }, "id": { "type": "string" }, "pluginId": { "default": null, "description": "Trusted first-party plugin id when this command resolves to one plugin script.", "type": ["string", "null"] }, "processId": { "description": "Identifier for the underlying PTY process (when available).", "type": ["string", "null"] }, "scriptPath": { "default": null, "description": "Safe plugin-relative path when this command resolves to one plugin script.", "type": ["string", "null"] }, "source": { "allOf": [{ "$ref": "#/definitions/v2/CommandExecutionSource" }], "default": "agent" }, "status": { "$ref": "#/definitions/v2/CommandExecutionStatus" }, "type": { "enum": ["commandExecution"], "title": "CommandExecutionThreadItemType", "type": "string" } }, "required": ["command", "commandActions", "cwd", "id", "status", "type"], "title": "CommandExecutionThreadItem", "type": "object" }, { "properties": { "changes": { "items": { "$ref": "#/definitions/v2/FileUpdateChange" }, "type": "array" }, "id": { "type": "string" }, "status": { "$ref": "#/definitions/v2/PatchApplyStatus" }, "type": { "enum": ["fileChange"], "title": "FileChangeThreadItemType", "type": "string" } }, "required": ["changes", "id", "status", "type"], "title": "FileChangeThreadItem", "type": "object" }, { "properties": { "appContext": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallAppContext" }, { "type": "null" }] }, "arguments": true, "durationMs": { "description": "The duration of the MCP tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "error": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallError" }, { "type": "null" }] }, "id": { "type": "string" }, "mcpAppResourceUri": { "description": "Deprecated: use `appContext.resourceUri` instead.", "type": ["string", "null"] }, "pluginId": { "type": ["string", "null"] }, "readOnlyHint": { "type": ["boolean", "null"] }, "result": { "anyOf": [{ "$ref": "#/definitions/v2/McpToolCallResult" }, { "type": "null" }] }, "server": { "type": "string" }, "status": { "$ref": "#/definitions/v2/McpToolCallStatus" }, "tool": { "type": "string" }, "type": { "enum": ["mcpToolCall"], "title": "McpToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "server", "status", "tool", "type"], "title": "McpToolCallThreadItem", "type": "object" }, { "properties": { "arguments": true, "contentItems": { "items": { "$ref": "#/definitions/v2/DynamicToolCallOutputContentItem" }, "type": ["array", "null"] }, "durationMs": { "description": "The duration of the dynamic tool call in milliseconds.", "format": "int64", "type": ["integer", "null"] }, "id": { "type": "string" }, "namespace": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/DynamicToolCallStatus" }, "success": { "type": ["boolean", "null"] }, "tool": { "type": "string" }, "type": { "enum": ["dynamicToolCall"], "title": "DynamicToolCallThreadItemType", "type": "string" } }, "required": ["arguments", "id", "status", "tool", "type"], "title": "DynamicToolCallThreadItem", "type": "object" }, { "properties": { "agentsStates": { "additionalProperties": { "$ref": "#/definitions/v2/CollabAgentState" }, "description": "Last known status of the target agents, when available.", "type": "object" }, "id": { "description": "Unique identifier for this collab tool call.", "type": "string" }, "model": { "description": "Model requested for the spawned agent, when applicable.", "type": ["string", "null"] }, "prompt": { "description": "Prompt text sent as part of the collab tool call, when available.", "type": ["string", "null"] }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }], "description": "Reasoning effort requested for the spawned agent, when applicable." }, "receiverThreadIds": { "description": "Thread ID of the receiving agent, when applicable. In case of spawn operation, this corresponds to the newly spawned agent.", "items": { "type": "string" }, "type": "array" }, "senderThreadId": { "description": "Thread ID of the agent issuing the collab request.", "type": "string" }, "status": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentToolCallStatus" }], "description": "Current status of the collab tool call." }, "tool": { "allOf": [{ "$ref": "#/definitions/v2/CollabAgentTool" }], "description": "Name of the collab tool that was invoked." }, "type": { "enum": ["collabAgentToolCall"], "title": "CollabAgentToolCallThreadItemType", "type": "string" } }, "required": ["agentsStates", "id", "receiverThreadIds", "senderThreadId", "status", "tool", "type"], "title": "CollabAgentToolCallThreadItem", "type": "object" }, { "properties": { "agentPath": { "type": "string" }, "agentThreadId": { "type": "string" }, "id": { "type": "string" }, "kind": { "$ref": "#/definitions/v2/SubAgentActivityKind" }, "type": { "enum": ["subAgentActivity"], "title": "SubAgentActivityThreadItemType", "type": "string" } }, "required": ["agentPath", "agentThreadId", "id", "kind", "type"], "title": "SubAgentActivityThreadItem", "type": "object" }, { "properties": { "action": { "anyOf": [{ "$ref": "#/definitions/v2/WebSearchAction" }, { "type": "null" }] }, "id": { "type": "string" }, "query": { "type": "string" }, "results": { "default": null, "description": "Structured search results returned out-of-band by standalone web search.\n\nThese stay as opaque JSON at the extension/app-server boundary so new result fields and result types can pass through without a Codex release.", "items": true, "type": ["array", "null"] }, "type": { "enum": ["webSearch"], "title": "WebSearchThreadItemType", "type": "string" } }, "required": ["id", "query", "type"], "title": "WebSearchThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["imageView"], "title": "ImageViewThreadItemType", "type": "string" } }, "required": ["id", "path", "type"], "title": "ImageViewThreadItem", "type": "object" }, { "description": "Display item emitted by the interruptible `clock.sleep` tool.", "properties": { "durationMs": { "format": "uint64", "minimum": 0, "type": "integer" }, "id": { "type": "string" }, "type": { "enum": ["sleep"], "title": "SleepThreadItemType", "type": "string" } }, "required": ["durationMs", "id", "type"], "title": "SleepThreadItem", "type": "object" }, { "properties": { "failure": { "anyOf": [{ "$ref": "#/definitions/v2/ImageGenerationFailure" }, { "type": "null" }], "default": null }, "id": { "type": "string" }, "result": { "type": "string" }, "revisedPrompt": { "type": ["string", "null"] }, "savedPath": { "anyOf": [{ "$ref": "#/definitions/v2/AbsolutePathBuf" }, { "type": "null" }] }, "status": { "type": "string" }, "transparentBackground": { "default": null, "type": ["boolean", "null"] }, "type": { "enum": ["imageGeneration"], "title": "ImageGenerationThreadItemType", "type": "string" } }, "required": ["id", "result", "status", "type"], "title": "ImageGenerationThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["enteredReviewMode"], "title": "EnteredReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "EnteredReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "review": { "type": "string" }, "type": { "enum": ["exitedReviewMode"], "title": "ExitedReviewModeThreadItemType", "type": "string" } }, "required": ["id", "review", "type"], "title": "ExitedReviewModeThreadItem", "type": "object" }, { "properties": { "id": { "type": "string" }, "type": { "enum": ["contextCompaction"], "title": "ContextCompactionThreadItemType", "type": "string" } }, "required": ["id", "type"], "title": "ContextCompactionThreadItem", "type": "object" }] };
var schema57 = { "enum": ["async"], "type": "string" };
var schema60 = { "description": 'Classifies an assistant message as interim commentary or final answer text.\n\nProviders do not emit this consistently, so callers must treat `None` as "phase unknown" and keep compatibility behavior for legacy models.', "oneOf": [{ "description": "Mid-turn assistant text (for example preamble/progress narration).\n\nAdditional tool calls or assistant output may follow before turn completion.", "enum": ["commentary"], "type": "string" }, { "description": "The assistant's terminal answer text for the current turn.", "enum": ["final_answer"], "type": "string" }] };
var schema67 = { "enum": ["agent", "userShell", "unifiedExecStartup", "unifiedExecInteraction"], "type": "string" };
var schema68 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema71 = { "enum": ["inProgress", "completed", "failed", "declined"], "type": "string" };
var schema72 = { "properties": { "actionName": { "type": ["string", "null"] }, "appName": { "type": ["string", "null"] }, "connectorId": { "type": "string" }, "linkId": { "type": ["string", "null"] }, "resourceUri": { "type": ["string", "null"] } }, "required": ["connectorId"], "type": "object" };
var schema75 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema76 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "type": { "enum": ["inputText"], "title": "InputTextDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["text", "type"], "title": "InputTextDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "imageUrl": { "type": "string" }, "type": { "enum": ["inputImage"], "title": "InputImageDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["imageUrl", "type"], "title": "InputImageDynamicToolCallOutputContentItem", "type": "object" }, { "properties": { "audioUrl": { "type": "string" }, "type": { "enum": ["inputAudio"], "title": "InputAudioDynamicToolCallOutputContentItemType", "type": "string" } }, "required": ["audioUrl", "type"], "title": "InputAudioDynamicToolCallOutputContentItem", "type": "object" }] };
var schema77 = { "enum": ["inProgress", "completed", "failed"], "type": "string" };
var schema81 = { "enum": ["inProgress", "completed", "failed", "interrupted"], "type": "string" };
var schema82 = { "enum": ["spawnAgent", "sendInput", "resumeAgent", "wait", "closeAgent", "sendMessage", "followupTask", "interruptAgent", "listAgents"], "type": "string" };
var schema83 = { "enum": ["started", "interacted", "interrupted", "completed"], "type": "string" };
var schema84 = { "oneOf": [{ "properties": { "queries": { "items": { "type": "string" }, "type": ["array", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "SearchWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["openPage"], "title": "OpenPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "OpenPageWebSearchAction", "type": "object" }, { "properties": { "pattern": { "type": ["string", "null"] }, "type": { "enum": ["findInPage"], "title": "FindInPageWebSearchActionType", "type": "string" }, "url": { "type": ["string", "null"] } }, "required": ["type"], "title": "FindInPageWebSearchAction", "type": "object" }, { "properties": { "type": { "enum": ["other"], "title": "OtherWebSearchActionType", "type": "string" } }, "required": ["type"], "title": "OtherWebSearchAction", "type": "object" }] };
var schema86 = { "oneOf": [{ "properties": { "limitId": { "type": "string" }, "resetsAt": { "format": "int64", "type": ["integer", "null"] }, "type": { "enum": ["usageLimitExceeded"], "title": "UsageLimitExceededImageGenerationFailureType", "type": "string" } }, "required": ["limitId", "type"], "title": "UsageLimitExceededImageGenerationFailure", "type": "object" }] };
var schema51 = { "oneOf": [{ "properties": { "text": { "type": "string" }, "text_elements": { "default": [], "description": "UI-defined spans within `text` used to render or persist special elements.", "items": { "$ref": "#/definitions/v2/TextElement" }, "type": "array" }, "type": { "enum": ["text"], "title": "TextUserInputType", "type": "string" } }, "required": ["text", "type"], "title": "TextUserInput", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "type": { "enum": ["image"], "title": "ImageUserInputType", "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"], "title": "ImageUserInput", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }], "default": null }, "path": { "type": "string" }, "type": { "enum": ["localImage"], "title": "LocalImageUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalImageUserInput", "type": "object" }, { "properties": { "type": { "enum": ["audio"], "title": "AudioUserInputType", "type": "string" }, "url": { "type": "string" } }, "required": ["type", "url"], "title": "AudioUserInput", "type": "object" }, { "properties": { "path": { "type": "string" }, "type": { "enum": ["localAudio"], "title": "LocalAudioUserInputType", "type": "string" } }, "required": ["path", "type"], "title": "LocalAudioUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["skill"], "title": "SkillUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "SkillUserInput", "type": "object" }, { "properties": { "name": { "type": "string" }, "path": { "type": "string" }, "type": { "enum": ["mention"], "title": "MentionUserInputType", "type": "string" } }, "required": ["name", "path", "type"], "title": "MentionUserInput", "type": "object" }] };
var schema54 = { "enum": ["auto", "low", "high", "original"], "type": "string" };
var schema52 = { "properties": { "byteRange": { "allOf": [{ "$ref": "#/definitions/v2/ByteRange" }], "description": "Byte range in the parent `text` buffer that this element occupies." }, "placeholder": { "description": "Optional human-readable placeholder for the element, displayed in the UI.", "type": ["string", "null"] } }, "required": ["byteRange"], "type": "object" };
function validate46(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.byteRange === void 0 && (missing0 = "byteRange")) {
        validate46.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                validate46.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.end !== void 0) {
                  let data1 = data0.end;
                  const _errs5 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate46.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  if (errors === _errs5) {
                    if (typeof data1 == "number" && isFinite(data1)) {
                      if (data1 < 0 || isNaN(data1)) {
                        validate46.errors = [{ instancePath: instancePath + "/byteRange/end", schemaPath: "#/definitions/v2/ByteRange/properties/end/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                      validate46.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/type", keyword: "type", params: { type: "integer" } }];
                      return false;
                    }
                    if (errors === _errs7) {
                      if (typeof data2 == "number" && isFinite(data2)) {
                        if (data2 < 0 || isNaN(data2)) {
                          validate46.errors = [{ instancePath: instancePath + "/byteRange/start", schemaPath: "#/definitions/v2/ByteRange/properties/start/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
              validate46.errors = [{ instancePath: instancePath + "/byteRange", schemaPath: "#/definitions/v2/ByteRange/type", keyword: "type", params: { type: "object" } }];
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
              validate46.errors = [{ instancePath: instancePath + "/placeholder", schemaPath: "#/properties/placeholder/type", keyword: "type", params: { type: schema52.properties.placeholder.type } }];
              return false;
            }
            var valid0 = _errs9 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate46.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate46.errors = vErrors;
  return errors === 0;
}
function validate45(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
                  if (!validate46(data1[i0], { instancePath: instancePath + "/text_elements/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
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
                const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[0].properties.type.enum } };
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
            const err8 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema54.enum } };
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
              const err12 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[1].properties.type.enum } };
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
              const err17 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema54.enum } };
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
                  const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[2].properties.type.enum } };
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
                const err26 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[3].properties.type.enum } };
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
                    const err32 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[4].properties.type.enum } };
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
                        const err38 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[5].properties.type.enum } };
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
                          const err44 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema51.oneOf[6].properties.type.enum } };
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
    validate45.errors = vErrors;
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
  validate45.errors = vErrors;
  return errors === 0;
}
function validate49(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.entries === void 0 && (missing0 = "entries") || data.threadIds === void 0 && (missing0 = "threadIds")) {
        validate49.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                      validate49.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/required", keyword: "required", params: { missingProperty: missing1 } }];
                      return false;
                    } else {
                      if (data1.lineEnd !== void 0) {
                        let data2 = data1.lineEnd;
                        const _errs6 = errors;
                        if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                          validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/type", keyword: "type", params: { type: "integer" } }];
                          return false;
                        }
                        if (errors === _errs6) {
                          if (typeof data2 == "number" && isFinite(data2)) {
                            if (data2 < 0 || isNaN(data2)) {
                              validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineEnd", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineEnd/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                            validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/type", keyword: "type", params: { type: "integer" } }];
                            return false;
                          }
                          if (errors === _errs8) {
                            if (typeof data3 == "number" && isFinite(data3)) {
                              if (data3 < 0 || isNaN(data3)) {
                                validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/lineStart", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/lineStart/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } }];
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
                              validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/note", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/note/type", keyword: "type", params: { type: "string" } }];
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
                                validate49.errors = [{ instancePath: instancePath + "/entries/" + i0 + "/path", schemaPath: "#/definitions/v2/MemoryCitationEntry/properties/path/type", keyword: "type", params: { type: "string" } }];
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
                    validate49.errors = [{ instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/v2/MemoryCitationEntry/type", keyword: "type", params: { type: "object" } }];
                    return false;
                  }
                }
                var valid1 = _errs3 === errors;
                if (!valid1) {
                  break;
                }
              }
            } else {
              validate49.errors = [{ instancePath: instancePath + "/entries", schemaPath: "#/properties/entries/type", keyword: "type", params: { type: "array" } }];
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
                    validate49.errors = [{ instancePath: instancePath + "/threadIds/" + i1, schemaPath: "#/properties/threadIds/items/type", keyword: "type", params: { type: "string" } }];
                    return false;
                  }
                  var valid4 = _errs16 === errors;
                  if (!valid4) {
                    break;
                  }
                }
              } else {
                validate49.errors = [{ instancePath: instancePath + "/threadIds", schemaPath: "#/properties/threadIds/type", keyword: "type", params: { type: "array" } }];
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
      validate49.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate49.errors = vErrors;
  return errors === 0;
}
var schema62 = { "description": "Responses API compatible content items that can be returned by a tool call. This is a subset of ContentItem with the types we support as function call outputs.", "oneOf": [{ "properties": { "text": { "type": "string" }, "type": { "enum": ["input_text"], "title": "InputTextFunctionCallOutputContentItemType", "type": "string" } }, "required": ["text", "type"], "title": "InputTextFunctionCallOutputContentItem", "type": "object" }, { "properties": { "detail": { "anyOf": [{ "$ref": "#/definitions/v2/ImageDetail" }, { "type": "null" }] }, "image_url": { "type": "string" }, "type": { "enum": ["input_image"], "title": "InputImageFunctionCallOutputContentItemType", "type": "string" } }, "required": ["image_url", "type"], "title": "InputImageFunctionCallOutputContentItem", "type": "object" }, { "properties": { "audio_url": { "type": "string" }, "type": { "enum": ["input_audio"], "title": "InputAudioFunctionCallOutputContentItemType", "type": "string" } }, "required": ["audio_url", "type"], "title": "InputAudioFunctionCallOutputContentItem", "type": "object" }, { "properties": { "encrypted_content": { "type": "string" }, "type": { "enum": ["encrypted_content"], "title": "EncryptedContentFunctionCallOutputContentItemType", "type": "string" } }, "required": ["encrypted_content", "type"], "title": "EncryptedContentFunctionCallOutputContentItem", "type": "object" }] };
function validate52(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
              const err3 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[0].properties.type.enum } };
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
  if (errors === _errs7) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing1;
      if (data.image_url === void 0 && (missing1 = "image_url") || data.type === void 0 && (missing1 = "type")) {
        const err5 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: missing1 } };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      } else {
        if (data.detail !== void 0) {
          let data2 = data.detail;
          const _errs9 = errors;
          const _errs10 = errors;
          let valid3 = false;
          const _errs11 = errors;
          if (typeof data2 !== "string") {
            const err6 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data2 === "auto" || data2 === "low" || data2 === "high" || data2 === "original")) {
            const err7 = { instancePath: instancePath + "/detail", schemaPath: "#/definitions/v2/ImageDetail/enum", keyword: "enum", params: { allowedValues: schema54.enum } };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          var _valid1 = _errs11 === errors;
          valid3 = valid3 || _valid1;
          if (!valid3) {
            const _errs14 = errors;
            if (data2 !== null) {
              const err8 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf/1/type", keyword: "type", params: { type: "null" } };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            var _valid1 = _errs14 === errors;
            valid3 = valid3 || _valid1;
          }
          if (!valid3) {
            const err9 = { instancePath: instancePath + "/detail", schemaPath: "#/oneOf/1/properties/detail/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
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
          var valid2 = _errs9 === errors;
        } else {
          var valid2 = true;
        }
        if (valid2) {
          if (data.image_url !== void 0) {
            const _errs16 = errors;
            if (typeof data.image_url !== "string") {
              const err10 = { instancePath: instancePath + "/image_url", schemaPath: "#/oneOf/1/properties/image_url/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            var valid2 = _errs16 === errors;
          } else {
            var valid2 = true;
          }
          if (valid2) {
            if (data.type !== void 0) {
              let data4 = data.type;
              const _errs18 = errors;
              if (typeof data4 !== "string") {
                const err11 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              if (!(data4 === "input_image")) {
                const err12 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[1].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              var valid2 = _errs18 === errors;
            } else {
              var valid2 = true;
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
  var _valid0 = _errs7 === errors;
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
        if (data.audio_url === void 0 && (missing2 = "audio_url") || data.type === void 0 && (missing2 = "type")) {
          const err14 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: missing2 } };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        } else {
          if (data.audio_url !== void 0) {
            const _errs22 = errors;
            if (typeof data.audio_url !== "string") {
              const err15 = { instancePath: instancePath + "/audio_url", schemaPath: "#/oneOf/2/properties/audio_url/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            var valid5 = _errs22 === errors;
          } else {
            var valid5 = true;
          }
          if (valid5) {
            if (data.type !== void 0) {
              let data6 = data.type;
              const _errs24 = errors;
              if (typeof data6 !== "string") {
                const err16 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              if (!(data6 === "input_audio")) {
                const err17 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[2].properties.type.enum } };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
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
        const err18 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
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
      const _errs26 = errors;
      if (errors === _errs26) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing3;
          if (data.encrypted_content === void 0 && (missing3 = "encrypted_content") || data.type === void 0 && (missing3 = "type")) {
            const err19 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing3 } };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          } else {
            if (data.encrypted_content !== void 0) {
              const _errs28 = errors;
              if (typeof data.encrypted_content !== "string") {
                const err20 = { instancePath: instancePath + "/encrypted_content", schemaPath: "#/oneOf/3/properties/encrypted_content/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              var valid6 = _errs28 === errors;
            } else {
              var valid6 = true;
            }
            if (valid6) {
              if (data.type !== void 0) {
                let data8 = data.type;
                const _errs30 = errors;
                if (typeof data8 !== "string") {
                  const err21 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (!(data8 === "encrypted_content")) {
                  const err22 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema62.oneOf[3].properties.type.enum } };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                var valid6 = _errs30 === errors;
              } else {
                var valid6 = true;
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
      var _valid0 = _errs26 === errors;
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
    validate52.errors = vErrors;
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
  validate52.errors = vErrors;
  return errors === 0;
}
function validate51(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!validate52(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
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
    validate51.errors = vErrors;
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
  validate51.errors = vErrors;
  return errors === 0;
}
var schema64 = { "oneOf": [{ "properties": { "command": { "type": "string" }, "name": { "type": "string" }, "path": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": { "enum": ["read"], "title": "ReadCommandActionType", "type": "string" } }, "required": ["command", "name", "path", "type"], "title": "ReadCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "type": { "enum": ["listFiles"], "title": "ListFilesCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "ListFilesCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "path": { "type": ["string", "null"] }, "query": { "type": ["string", "null"] }, "type": { "enum": ["search"], "title": "SearchCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "SearchCommandAction", "type": "object" }, { "properties": { "command": { "type": "string" }, "type": { "enum": ["unknown"], "title": "UnknownCommandActionType", "type": "string" } }, "required": ["command", "type"], "title": "UnknownCommandAction", "type": "object" }] };
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
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema64.oneOf[0].properties.type.enum } };
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
              const err9 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/1/properties/path/type", keyword: "type", params: { type: schema64.oneOf[1].properties.path.type } };
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
                const err11 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema64.oneOf[1].properties.type.enum } };
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
                const err15 = { instancePath: instancePath + "/path", schemaPath: "#/oneOf/2/properties/path/type", keyword: "type", params: { type: schema64.oneOf[2].properties.path.type } };
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
                  const err16 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/2/properties/query/type", keyword: "type", params: { type: schema64.oneOf[2].properties.query.type } };
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
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema64.oneOf[2].properties.type.enum } };
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
                  const err23 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema64.oneOf[3].properties.type.enum } };
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
var schema70 = { "oneOf": [{ "properties": { "type": { "enum": ["add"], "title": "AddPatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "AddPatchChangeKind", "type": "object" }, { "properties": { "type": { "enum": ["delete"], "title": "DeletePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "DeletePatchChangeKind", "type": "object" }, { "properties": { "move_path": { "type": ["string", "null"] }, "type": { "enum": ["update"], "title": "UpdatePatchChangeKindType", "type": "string" } }, "required": ["type"], "title": "UpdatePatchChangeKind", "type": "object" }] };
function validate57(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.diff === void 0 && (missing0 = "diff") || data.kind === void 0 && (missing0 = "kind") || data.path === void 0 && (missing0 = "path")) {
        validate57.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.diff !== void 0) {
          const _errs1 = errors;
          if (typeof data.diff !== "string") {
            validate57.errors = [{ instancePath: instancePath + "/diff", schemaPath: "#/properties/diff/type", keyword: "type", params: { type: "string" } }];
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
                      const err2 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema70.oneOf[0].properties.type.enum } };
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
                      const err6 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema70.oneOf[1].properties.type.enum } };
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
                        const err9 = { instancePath: instancePath + "/kind/move_path", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/move_path/type", keyword: "type", params: { type: schema70.oneOf[2].properties.move_path.type } };
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
                          const err11 = { instancePath: instancePath + "/kind/type", schemaPath: "#/definitions/v2/PatchChangeKind/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema70.oneOf[2].properties.type.enum } };
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
              validate57.errors = vErrors;
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
                validate57.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: "string" } }];
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
      validate57.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate57.errors = vErrors;
  return errors === 0;
}
var schema78 = { "properties": { "message": { "type": ["string", "null"] }, "status": { "$ref": "#/definitions/v2/CollabAgentStatus" } }, "required": ["status"], "type": "object" };
var schema79 = { "enum": ["pendingInit", "running", "interrupted", "completed", "errored", "shutdown", "notFound"], "type": "string" };
function validate59(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate59.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.message !== void 0) {
          let data0 = data.message;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate59.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: schema78.properties.message.type } }];
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
              validate59.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data1 === "pendingInit" || data1 === "running" || data1 === "interrupted" || data1 === "completed" || data1 === "errored" || data1 === "shutdown" || data1 === "notFound")) {
              validate59.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentStatus/enum", keyword: "enum", params: { allowedValues: schema79.enum } }];
              return false;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate59.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate59.errors = vErrors;
  return errors === 0;
}
var func2 = require_ucs2length().default;
function validate44(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err1 = { instancePath: instancePath + "/clientId", schemaPath: "#/oneOf/0/properties/clientId/type", keyword: "type", params: { type: schema50.oneOf[0].properties.clientId.type } };
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
                  if (!validate45(data1[i0], { instancePath: instancePath + "/content/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
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
                  const err5 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[0].properties.type.enum } };
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
                const err15 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[1].properties.type.enum } };
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
              const err19 = { instancePath: instancePath + "/delivery", schemaPath: "#/definitions/v2/AgentMessageDelivery/enum", keyword: "enum", params: { allowedValues: schema57.enum } };
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
                if (!validate49(data13, { instancePath: instancePath + "/memoryCitation", parentData: data, parentDataProperty: "memoryCitation", rootData })) {
                  vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
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
                    const err26 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema60.oneOf[0].enum } };
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
                    const err28 = { instancePath: instancePath + "/phase", schemaPath: "#/definitions/v2/MessagePhase/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema60.oneOf[1].enum } };
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
                  if (data.text !== void 0) {
                    const _errs54 = errors;
                    if (typeof data.text !== "string") {
                      const err32 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/2/properties/text/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                    var valid7 = _errs54 === errors;
                  } else {
                    var valid7 = true;
                  }
                  if (valid7) {
                    if (data.type !== void 0) {
                      let data16 = data.type;
                      const _errs56 = errors;
                      if (typeof data16 !== "string") {
                        const err33 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err33];
                        } else {
                          vErrors.push(err33);
                        }
                        errors++;
                      }
                      if (!(data16 === "agentMessage")) {
                        const err34 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[2].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err34];
                        } else {
                          vErrors.push(err34);
                        }
                        errors++;
                      }
                      var valid7 = _errs56 === errors;
                    } else {
                      var valid7 = true;
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        const err35 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
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
      const _errs58 = errors;
      if (errors === _errs58) {
        if (data && typeof data == "object" && !Array.isArray(data)) {
          let missing4;
          if (data.id === void 0 && (missing4 = "id") || data.name === void 0 && (missing4 = "name") || data.output === void 0 && (missing4 = "output") || data.type === void 0 && (missing4 = "type")) {
            const err36 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: missing4 } };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          } else {
            if (data.id !== void 0) {
              const _errs60 = errors;
              if (typeof data.id !== "string") {
                const err37 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/3/properties/id/type", keyword: "type", params: { type: "string" } };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
              var valid14 = _errs60 === errors;
            } else {
              var valid14 = true;
            }
            if (valid14) {
              if (data.name !== void 0) {
                const _errs62 = errors;
                if (typeof data.name !== "string") {
                  const err38 = { instancePath: instancePath + "/name", schemaPath: "#/oneOf/3/properties/name/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
                var valid14 = _errs62 === errors;
              } else {
                var valid14 = true;
              }
              if (valid14) {
                if (data.namespace !== void 0) {
                  let data19 = data.namespace;
                  const _errs64 = errors;
                  if (typeof data19 !== "string" && data19 !== null) {
                    const err39 = { instancePath: instancePath + "/namespace", schemaPath: "#/oneOf/3/properties/namespace/type", keyword: "type", params: { type: schema50.oneOf[3].properties.namespace.type } };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                  var valid14 = _errs64 === errors;
                } else {
                  var valid14 = true;
                }
                if (valid14) {
                  if (data.output !== void 0) {
                    const _errs66 = errors;
                    if (!validate51(data.output, { instancePath: instancePath + "/output", parentData: data, parentDataProperty: "output", rootData })) {
                      vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
                      errors = vErrors.length;
                    }
                    var valid14 = _errs66 === errors;
                  } else {
                    var valid14 = true;
                  }
                  if (valid14) {
                    if (data.type !== void 0) {
                      let data21 = data.type;
                      const _errs67 = errors;
                      if (typeof data21 !== "string") {
                        const err40 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err40];
                        } else {
                          vErrors.push(err40);
                        }
                        errors++;
                      }
                      if (!(data21 === "functionCallOutput")) {
                        const err41 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[3].properties.type.enum } };
                        if (vErrors === null) {
                          vErrors = [err41];
                        } else {
                          vErrors.push(err41);
                        }
                        errors++;
                      }
                      var valid14 = _errs67 === errors;
                    } else {
                      var valid14 = true;
                    }
                  }
                }
              }
            }
          }
        } else {
          const err42 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" } };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
      }
      var _valid0 = _errs58 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs69 = errors;
        if (errors === _errs69) {
          if (data && typeof data == "object" && !Array.isArray(data)) {
            let missing5;
            if (data.id === void 0 && (missing5 = "id") || data.text === void 0 && (missing5 = "text") || data.type === void 0 && (missing5 = "type")) {
              const err43 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: missing5 } };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            } else {
              if (data.id !== void 0) {
                const _errs71 = errors;
                if (typeof data.id !== "string") {
                  const err44 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/4/properties/id/type", keyword: "type", params: { type: "string" } };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
                var valid15 = _errs71 === errors;
              } else {
                var valid15 = true;
              }
              if (valid15) {
                if (data.text !== void 0) {
                  const _errs73 = errors;
                  if (typeof data.text !== "string") {
                    const err45 = { instancePath: instancePath + "/text", schemaPath: "#/oneOf/4/properties/text/type", keyword: "type", params: { type: "string" } };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                  var valid15 = _errs73 === errors;
                } else {
                  var valid15 = true;
                }
                if (valid15) {
                  if (data.type !== void 0) {
                    let data24 = data.type;
                    const _errs75 = errors;
                    if (typeof data24 !== "string") {
                      const err46 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                    if (!(data24 === "plan")) {
                      const err47 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[4].properties.type.enum } };
                      if (vErrors === null) {
                        vErrors = [err47];
                      } else {
                        vErrors.push(err47);
                      }
                      errors++;
                    }
                    var valid15 = _errs75 === errors;
                  } else {
                    var valid15 = true;
                  }
                }
              }
            }
          } else {
            const err48 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" } };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        var _valid0 = _errs69 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs77 = errors;
          if (errors === _errs77) {
            if (data && typeof data == "object" && !Array.isArray(data)) {
              let missing6;
              if (data.id === void 0 && (missing6 = "id") || data.type === void 0 && (missing6 = "type")) {
                const err49 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: missing6 } };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              } else {
                if (data.content !== void 0) {
                  let data25 = data.content;
                  const _errs79 = errors;
                  if (errors === _errs79) {
                    if (Array.isArray(data25)) {
                      var valid17 = true;
                      const len2 = data25.length;
                      for (let i2 = 0; i2 < len2; i2++) {
                        const _errs81 = errors;
                        if (typeof data25[i2] !== "string") {
                          const err50 = { instancePath: instancePath + "/content/" + i2, schemaPath: "#/oneOf/5/properties/content/items/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err50];
                          } else {
                            vErrors.push(err50);
                          }
                          errors++;
                        }
                        var valid17 = _errs81 === errors;
                        if (!valid17) {
                          break;
                        }
                      }
                    } else {
                      const err51 = { instancePath: instancePath + "/content", schemaPath: "#/oneOf/5/properties/content/type", keyword: "type", params: { type: "array" } };
                      if (vErrors === null) {
                        vErrors = [err51];
                      } else {
                        vErrors.push(err51);
                      }
                      errors++;
                    }
                  }
                  var valid16 = _errs79 === errors;
                } else {
                  var valid16 = true;
                }
                if (valid16) {
                  if (data.id !== void 0) {
                    const _errs83 = errors;
                    if (typeof data.id !== "string") {
                      const err52 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/5/properties/id/type", keyword: "type", params: { type: "string" } };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                    var valid16 = _errs83 === errors;
                  } else {
                    var valid16 = true;
                  }
                  if (valid16) {
                    if (data.summary !== void 0) {
                      let data28 = data.summary;
                      const _errs85 = errors;
                      if (errors === _errs85) {
                        if (Array.isArray(data28)) {
                          var valid18 = true;
                          const len3 = data28.length;
                          for (let i3 = 0; i3 < len3; i3++) {
                            const _errs87 = errors;
                            if (typeof data28[i3] !== "string") {
                              const err53 = { instancePath: instancePath + "/summary/" + i3, schemaPath: "#/oneOf/5/properties/summary/items/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err53];
                              } else {
                                vErrors.push(err53);
                              }
                              errors++;
                            }
                            var valid18 = _errs87 === errors;
                            if (!valid18) {
                              break;
                            }
                          }
                        } else {
                          const err54 = { instancePath: instancePath + "/summary", schemaPath: "#/oneOf/5/properties/summary/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err54];
                          } else {
                            vErrors.push(err54);
                          }
                          errors++;
                        }
                      }
                      var valid16 = _errs85 === errors;
                    } else {
                      var valid16 = true;
                    }
                    if (valid16) {
                      if (data.type !== void 0) {
                        let data30 = data.type;
                        const _errs89 = errors;
                        if (typeof data30 !== "string") {
                          const err55 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err55];
                          } else {
                            vErrors.push(err55);
                          }
                          errors++;
                        }
                        if (!(data30 === "reasoning")) {
                          const err56 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/5/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[5].properties.type.enum } };
                          if (vErrors === null) {
                            vErrors = [err56];
                          } else {
                            vErrors.push(err56);
                          }
                          errors++;
                        }
                        var valid16 = _errs89 === errors;
                      } else {
                        var valid16 = true;
                      }
                    }
                  }
                }
              }
            } else {
              const err57 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" } };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
          var _valid0 = _errs77 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
            const _errs91 = errors;
            if (errors === _errs91) {
              if (data && typeof data == "object" && !Array.isArray(data)) {
                let missing7;
                if (data.command === void 0 && (missing7 = "command") || data.commandActions === void 0 && (missing7 = "commandActions") || data.cwd === void 0 && (missing7 = "cwd") || data.id === void 0 && (missing7 = "id") || data.status === void 0 && (missing7 = "status") || data.type === void 0 && (missing7 = "type")) {
                  const err58 = { instancePath, schemaPath: "#/oneOf/6/required", keyword: "required", params: { missingProperty: missing7 } };
                  if (vErrors === null) {
                    vErrors = [err58];
                  } else {
                    vErrors.push(err58);
                  }
                  errors++;
                } else {
                  if (data.aggregatedOutput !== void 0) {
                    let data31 = data.aggregatedOutput;
                    const _errs93 = errors;
                    if (typeof data31 !== "string" && data31 !== null) {
                      const err59 = { instancePath: instancePath + "/aggregatedOutput", schemaPath: "#/oneOf/6/properties/aggregatedOutput/type", keyword: "type", params: { type: schema50.oneOf[6].properties.aggregatedOutput.type } };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                    var valid19 = _errs93 === errors;
                  } else {
                    var valid19 = true;
                  }
                  if (valid19) {
                    if (data.command !== void 0) {
                      const _errs95 = errors;
                      if (typeof data.command !== "string") {
                        const err60 = { instancePath: instancePath + "/command", schemaPath: "#/oneOf/6/properties/command/type", keyword: "type", params: { type: "string" } };
                        if (vErrors === null) {
                          vErrors = [err60];
                        } else {
                          vErrors.push(err60);
                        }
                        errors++;
                      }
                      var valid19 = _errs95 === errors;
                    } else {
                      var valid19 = true;
                    }
                    if (valid19) {
                      if (data.commandActions !== void 0) {
                        let data33 = data.commandActions;
                        const _errs97 = errors;
                        if (errors === _errs97) {
                          if (Array.isArray(data33)) {
                            var valid20 = true;
                            const len4 = data33.length;
                            for (let i4 = 0; i4 < len4; i4++) {
                              const _errs99 = errors;
                              if (!validate55(data33[i4], { instancePath: instancePath + "/commandActions/" + i4, parentData: data33, parentDataProperty: i4, rootData })) {
                                vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
                                errors = vErrors.length;
                              }
                              var valid20 = _errs99 === errors;
                              if (!valid20) {
                                break;
                              }
                            }
                          } else {
                            const err61 = { instancePath: instancePath + "/commandActions", schemaPath: "#/oneOf/6/properties/commandActions/type", keyword: "type", params: { type: "array" } };
                            if (vErrors === null) {
                              vErrors = [err61];
                            } else {
                              vErrors.push(err61);
                            }
                            errors++;
                          }
                        }
                        var valid19 = _errs97 === errors;
                      } else {
                        var valid19 = true;
                      }
                      if (valid19) {
                        if (data.cwd !== void 0) {
                          const _errs100 = errors;
                          if (typeof data.cwd !== "string") {
                            const err62 = { instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err62];
                            } else {
                              vErrors.push(err62);
                            }
                            errors++;
                          }
                          var valid19 = _errs100 === errors;
                        } else {
                          var valid19 = true;
                        }
                        if (valid19) {
                          if (data.durationMs !== void 0) {
                            let data36 = data.durationMs;
                            const _errs104 = errors;
                            if (!(typeof data36 == "number" && (!(data36 % 1) && !isNaN(data36)) && isFinite(data36)) && data36 !== null) {
                              const err63 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/6/properties/durationMs/type", keyword: "type", params: { type: schema50.oneOf[6].properties.durationMs.type } };
                              if (vErrors === null) {
                                vErrors = [err63];
                              } else {
                                vErrors.push(err63);
                              }
                              errors++;
                            }
                            var valid19 = _errs104 === errors;
                          } else {
                            var valid19 = true;
                          }
                          if (valid19) {
                            if (data.exitCode !== void 0) {
                              let data37 = data.exitCode;
                              const _errs106 = errors;
                              if (!(typeof data37 == "number" && (!(data37 % 1) && !isNaN(data37)) && isFinite(data37)) && data37 !== null) {
                                const err64 = { instancePath: instancePath + "/exitCode", schemaPath: "#/oneOf/6/properties/exitCode/type", keyword: "type", params: { type: schema50.oneOf[6].properties.exitCode.type } };
                                if (vErrors === null) {
                                  vErrors = [err64];
                                } else {
                                  vErrors.push(err64);
                                }
                                errors++;
                              }
                              var valid19 = _errs106 === errors;
                            } else {
                              var valid19 = true;
                            }
                            if (valid19) {
                              if (data.id !== void 0) {
                                const _errs108 = errors;
                                if (typeof data.id !== "string") {
                                  const err65 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/6/properties/id/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err65];
                                  } else {
                                    vErrors.push(err65);
                                  }
                                  errors++;
                                }
                                var valid19 = _errs108 === errors;
                              } else {
                                var valid19 = true;
                              }
                              if (valid19) {
                                if (data.pluginId !== void 0) {
                                  let data39 = data.pluginId;
                                  const _errs110 = errors;
                                  if (typeof data39 !== "string" && data39 !== null) {
                                    const err66 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/6/properties/pluginId/type", keyword: "type", params: { type: schema50.oneOf[6].properties.pluginId.type } };
                                    if (vErrors === null) {
                                      vErrors = [err66];
                                    } else {
                                      vErrors.push(err66);
                                    }
                                    errors++;
                                  }
                                  var valid19 = _errs110 === errors;
                                } else {
                                  var valid19 = true;
                                }
                                if (valid19) {
                                  if (data.processId !== void 0) {
                                    let data40 = data.processId;
                                    const _errs112 = errors;
                                    if (typeof data40 !== "string" && data40 !== null) {
                                      const err67 = { instancePath: instancePath + "/processId", schemaPath: "#/oneOf/6/properties/processId/type", keyword: "type", params: { type: schema50.oneOf[6].properties.processId.type } };
                                      if (vErrors === null) {
                                        vErrors = [err67];
                                      } else {
                                        vErrors.push(err67);
                                      }
                                      errors++;
                                    }
                                    var valid19 = _errs112 === errors;
                                  } else {
                                    var valid19 = true;
                                  }
                                  if (valid19) {
                                    if (data.scriptPath !== void 0) {
                                      let data41 = data.scriptPath;
                                      const _errs114 = errors;
                                      if (typeof data41 !== "string" && data41 !== null) {
                                        const err68 = { instancePath: instancePath + "/scriptPath", schemaPath: "#/oneOf/6/properties/scriptPath/type", keyword: "type", params: { type: schema50.oneOf[6].properties.scriptPath.type } };
                                        if (vErrors === null) {
                                          vErrors = [err68];
                                        } else {
                                          vErrors.push(err68);
                                        }
                                        errors++;
                                      }
                                      var valid19 = _errs114 === errors;
                                    } else {
                                      var valid19 = true;
                                    }
                                    if (valid19) {
                                      if (data.source !== void 0) {
                                        let data42 = data.source;
                                        const _errs116 = errors;
                                        if (typeof data42 !== "string") {
                                          const err69 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err69];
                                          } else {
                                            vErrors.push(err69);
                                          }
                                          errors++;
                                        }
                                        if (!(data42 === "agent" || data42 === "userShell" || data42 === "unifiedExecStartup" || data42 === "unifiedExecInteraction")) {
                                          const err70 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/v2/CommandExecutionSource/enum", keyword: "enum", params: { allowedValues: schema67.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err70];
                                          } else {
                                            vErrors.push(err70);
                                          }
                                          errors++;
                                        }
                                        var valid19 = _errs116 === errors;
                                      } else {
                                        var valid19 = true;
                                      }
                                      if (valid19) {
                                        if (data.status !== void 0) {
                                          let data43 = data.status;
                                          const _errs120 = errors;
                                          if (typeof data43 !== "string") {
                                            const err71 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err71];
                                            } else {
                                              vErrors.push(err71);
                                            }
                                            errors++;
                                          }
                                          if (!(data43 === "inProgress" || data43 === "completed" || data43 === "failed" || data43 === "declined")) {
                                            const err72 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CommandExecutionStatus/enum", keyword: "enum", params: { allowedValues: schema68.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err72];
                                            } else {
                                              vErrors.push(err72);
                                            }
                                            errors++;
                                          }
                                          var valid19 = _errs120 === errors;
                                        } else {
                                          var valid19 = true;
                                        }
                                        if (valid19) {
                                          if (data.type !== void 0) {
                                            let data44 = data.type;
                                            const _errs123 = errors;
                                            if (typeof data44 !== "string") {
                                              const err73 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err73];
                                              } else {
                                                vErrors.push(err73);
                                              }
                                              errors++;
                                            }
                                            if (!(data44 === "commandExecution")) {
                                              const err74 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/6/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[6].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err74];
                                              } else {
                                                vErrors.push(err74);
                                              }
                                              errors++;
                                            }
                                            var valid19 = _errs123 === errors;
                                          } else {
                                            var valid19 = true;
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
                const err75 = { instancePath, schemaPath: "#/oneOf/6/type", keyword: "type", params: { type: "object" } };
                if (vErrors === null) {
                  vErrors = [err75];
                } else {
                  vErrors.push(err75);
                }
                errors++;
              }
            }
            var _valid0 = _errs91 === errors;
            if (_valid0 && valid0) {
              valid0 = false;
              passing0 = [passing0, 6];
            } else {
              if (_valid0) {
                valid0 = true;
                passing0 = 6;
              }
              const _errs125 = errors;
              if (errors === _errs125) {
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  let missing8;
                  if (data.changes === void 0 && (missing8 = "changes") || data.id === void 0 && (missing8 = "id") || data.status === void 0 && (missing8 = "status") || data.type === void 0 && (missing8 = "type")) {
                    const err76 = { instancePath, schemaPath: "#/oneOf/7/required", keyword: "required", params: { missingProperty: missing8 } };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  } else {
                    if (data.changes !== void 0) {
                      let data45 = data.changes;
                      const _errs127 = errors;
                      if (errors === _errs127) {
                        if (Array.isArray(data45)) {
                          var valid27 = true;
                          const len5 = data45.length;
                          for (let i5 = 0; i5 < len5; i5++) {
                            const _errs129 = errors;
                            if (!validate57(data45[i5], { instancePath: instancePath + "/changes/" + i5, parentData: data45, parentDataProperty: i5, rootData })) {
                              vErrors = vErrors === null ? validate57.errors : vErrors.concat(validate57.errors);
                              errors = vErrors.length;
                            }
                            var valid27 = _errs129 === errors;
                            if (!valid27) {
                              break;
                            }
                          }
                        } else {
                          const err77 = { instancePath: instancePath + "/changes", schemaPath: "#/oneOf/7/properties/changes/type", keyword: "type", params: { type: "array" } };
                          if (vErrors === null) {
                            vErrors = [err77];
                          } else {
                            vErrors.push(err77);
                          }
                          errors++;
                        }
                      }
                      var valid26 = _errs127 === errors;
                    } else {
                      var valid26 = true;
                    }
                    if (valid26) {
                      if (data.id !== void 0) {
                        const _errs130 = errors;
                        if (typeof data.id !== "string") {
                          const err78 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/7/properties/id/type", keyword: "type", params: { type: "string" } };
                          if (vErrors === null) {
                            vErrors = [err78];
                          } else {
                            vErrors.push(err78);
                          }
                          errors++;
                        }
                        var valid26 = _errs130 === errors;
                      } else {
                        var valid26 = true;
                      }
                      if (valid26) {
                        if (data.status !== void 0) {
                          let data48 = data.status;
                          const _errs132 = errors;
                          if (typeof data48 !== "string") {
                            const err79 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/type", keyword: "type", params: { type: "string" } };
                            if (vErrors === null) {
                              vErrors = [err79];
                            } else {
                              vErrors.push(err79);
                            }
                            errors++;
                          }
                          if (!(data48 === "inProgress" || data48 === "completed" || data48 === "failed" || data48 === "declined")) {
                            const err80 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/PatchApplyStatus/enum", keyword: "enum", params: { allowedValues: schema71.enum } };
                            if (vErrors === null) {
                              vErrors = [err80];
                            } else {
                              vErrors.push(err80);
                            }
                            errors++;
                          }
                          var valid26 = _errs132 === errors;
                        } else {
                          var valid26 = true;
                        }
                        if (valid26) {
                          if (data.type !== void 0) {
                            let data49 = data.type;
                            const _errs135 = errors;
                            if (typeof data49 !== "string") {
                              const err81 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/type", keyword: "type", params: { type: "string" } };
                              if (vErrors === null) {
                                vErrors = [err81];
                              } else {
                                vErrors.push(err81);
                              }
                              errors++;
                            }
                            if (!(data49 === "fileChange")) {
                              const err82 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/7/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[7].properties.type.enum } };
                              if (vErrors === null) {
                                vErrors = [err82];
                              } else {
                                vErrors.push(err82);
                              }
                              errors++;
                            }
                            var valid26 = _errs135 === errors;
                          } else {
                            var valid26 = true;
                          }
                        }
                      }
                    }
                  }
                } else {
                  const err83 = { instancePath, schemaPath: "#/oneOf/7/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err83];
                  } else {
                    vErrors.push(err83);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs125 === errors;
              if (_valid0 && valid0) {
                valid0 = false;
                passing0 = [passing0, 7];
              } else {
                if (_valid0) {
                  valid0 = true;
                  passing0 = 7;
                }
                const _errs137 = errors;
                if (errors === _errs137) {
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    let missing9;
                    if (data.arguments === void 0 && (missing9 = "arguments") || data.id === void 0 && (missing9 = "id") || data.server === void 0 && (missing9 = "server") || data.status === void 0 && (missing9 = "status") || data.tool === void 0 && (missing9 = "tool") || data.type === void 0 && (missing9 = "type")) {
                      const err84 = { instancePath, schemaPath: "#/oneOf/8/required", keyword: "required", params: { missingProperty: missing9 } };
                      if (vErrors === null) {
                        vErrors = [err84];
                      } else {
                        vErrors.push(err84);
                      }
                      errors++;
                    } else {
                      if (data.appContext !== void 0) {
                        let data50 = data.appContext;
                        const _errs139 = errors;
                        const _errs140 = errors;
                        let valid30 = false;
                        const _errs141 = errors;
                        const _errs142 = errors;
                        if (errors === _errs142) {
                          if (data50 && typeof data50 == "object" && !Array.isArray(data50)) {
                            let missing10;
                            if (data50.connectorId === void 0 && (missing10 = "connectorId")) {
                              const err85 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/required", keyword: "required", params: { missingProperty: missing10 } };
                              if (vErrors === null) {
                                vErrors = [err85];
                              } else {
                                vErrors.push(err85);
                              }
                              errors++;
                            } else {
                              if (data50.actionName !== void 0) {
                                let data51 = data50.actionName;
                                const _errs144 = errors;
                                if (typeof data51 !== "string" && data51 !== null) {
                                  const err86 = { instancePath: instancePath + "/appContext/actionName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/actionName/type", keyword: "type", params: { type: schema72.properties.actionName.type } };
                                  if (vErrors === null) {
                                    vErrors = [err86];
                                  } else {
                                    vErrors.push(err86);
                                  }
                                  errors++;
                                }
                                var valid32 = _errs144 === errors;
                              } else {
                                var valid32 = true;
                              }
                              if (valid32) {
                                if (data50.appName !== void 0) {
                                  let data52 = data50.appName;
                                  const _errs146 = errors;
                                  if (typeof data52 !== "string" && data52 !== null) {
                                    const err87 = { instancePath: instancePath + "/appContext/appName", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/appName/type", keyword: "type", params: { type: schema72.properties.appName.type } };
                                    if (vErrors === null) {
                                      vErrors = [err87];
                                    } else {
                                      vErrors.push(err87);
                                    }
                                    errors++;
                                  }
                                  var valid32 = _errs146 === errors;
                                } else {
                                  var valid32 = true;
                                }
                                if (valid32) {
                                  if (data50.connectorId !== void 0) {
                                    const _errs148 = errors;
                                    if (typeof data50.connectorId !== "string") {
                                      const err88 = { instancePath: instancePath + "/appContext/connectorId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/connectorId/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err88];
                                      } else {
                                        vErrors.push(err88);
                                      }
                                      errors++;
                                    }
                                    var valid32 = _errs148 === errors;
                                  } else {
                                    var valid32 = true;
                                  }
                                  if (valid32) {
                                    if (data50.linkId !== void 0) {
                                      let data54 = data50.linkId;
                                      const _errs150 = errors;
                                      if (typeof data54 !== "string" && data54 !== null) {
                                        const err89 = { instancePath: instancePath + "/appContext/linkId", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/linkId/type", keyword: "type", params: { type: schema72.properties.linkId.type } };
                                        if (vErrors === null) {
                                          vErrors = [err89];
                                        } else {
                                          vErrors.push(err89);
                                        }
                                        errors++;
                                      }
                                      var valid32 = _errs150 === errors;
                                    } else {
                                      var valid32 = true;
                                    }
                                    if (valid32) {
                                      if (data50.resourceUri !== void 0) {
                                        let data55 = data50.resourceUri;
                                        const _errs152 = errors;
                                        if (typeof data55 !== "string" && data55 !== null) {
                                          const err90 = { instancePath: instancePath + "/appContext/resourceUri", schemaPath: "#/definitions/v2/McpToolCallAppContext/properties/resourceUri/type", keyword: "type", params: { type: schema72.properties.resourceUri.type } };
                                          if (vErrors === null) {
                                            vErrors = [err90];
                                          } else {
                                            vErrors.push(err90);
                                          }
                                          errors++;
                                        }
                                        var valid32 = _errs152 === errors;
                                      } else {
                                        var valid32 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            const err91 = { instancePath: instancePath + "/appContext", schemaPath: "#/definitions/v2/McpToolCallAppContext/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err91];
                            } else {
                              vErrors.push(err91);
                            }
                            errors++;
                          }
                        }
                        var _valid5 = _errs141 === errors;
                        valid30 = valid30 || _valid5;
                        if (!valid30) {
                          const _errs154 = errors;
                          if (data50 !== null) {
                            const err92 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/8/properties/appContext/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err92];
                            } else {
                              vErrors.push(err92);
                            }
                            errors++;
                          }
                          var _valid5 = _errs154 === errors;
                          valid30 = valid30 || _valid5;
                        }
                        if (!valid30) {
                          const err93 = { instancePath: instancePath + "/appContext", schemaPath: "#/oneOf/8/properties/appContext/anyOf", keyword: "anyOf", params: {} };
                          if (vErrors === null) {
                            vErrors = [err93];
                          } else {
                            vErrors.push(err93);
                          }
                          errors++;
                        } else {
                          errors = _errs140;
                          if (vErrors !== null) {
                            if (_errs140) {
                              vErrors.length = _errs140;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid29 = _errs139 === errors;
                      } else {
                        var valid29 = true;
                      }
                      if (valid29) {
                        if (data.durationMs !== void 0) {
                          let data56 = data.durationMs;
                          const _errs156 = errors;
                          if (!(typeof data56 == "number" && (!(data56 % 1) && !isNaN(data56)) && isFinite(data56)) && data56 !== null) {
                            const err94 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/8/properties/durationMs/type", keyword: "type", params: { type: schema50.oneOf[8].properties.durationMs.type } };
                            if (vErrors === null) {
                              vErrors = [err94];
                            } else {
                              vErrors.push(err94);
                            }
                            errors++;
                          }
                          var valid29 = _errs156 === errors;
                        } else {
                          var valid29 = true;
                        }
                        if (valid29) {
                          if (data.error !== void 0) {
                            let data57 = data.error;
                            const _errs158 = errors;
                            const _errs159 = errors;
                            let valid33 = false;
                            const _errs160 = errors;
                            const _errs161 = errors;
                            if (errors === _errs161) {
                              if (data57 && typeof data57 == "object" && !Array.isArray(data57)) {
                                let missing11;
                                if (data57.message === void 0 && (missing11 = "message")) {
                                  const err95 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/required", keyword: "required", params: { missingProperty: missing11 } };
                                  if (vErrors === null) {
                                    vErrors = [err95];
                                  } else {
                                    vErrors.push(err95);
                                  }
                                  errors++;
                                } else {
                                  if (data57.message !== void 0) {
                                    if (typeof data57.message !== "string") {
                                      const err96 = { instancePath: instancePath + "/error/message", schemaPath: "#/definitions/v2/McpToolCallError/properties/message/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err96];
                                      } else {
                                        vErrors.push(err96);
                                      }
                                      errors++;
                                    }
                                  }
                                }
                              } else {
                                const err97 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/v2/McpToolCallError/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err97];
                                } else {
                                  vErrors.push(err97);
                                }
                                errors++;
                              }
                            }
                            var _valid6 = _errs160 === errors;
                            valid33 = valid33 || _valid6;
                            if (!valid33) {
                              const _errs165 = errors;
                              if (data57 !== null) {
                                const err98 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/8/properties/error/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                if (vErrors === null) {
                                  vErrors = [err98];
                                } else {
                                  vErrors.push(err98);
                                }
                                errors++;
                              }
                              var _valid6 = _errs165 === errors;
                              valid33 = valid33 || _valid6;
                            }
                            if (!valid33) {
                              const err99 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/8/properties/error/anyOf", keyword: "anyOf", params: {} };
                              if (vErrors === null) {
                                vErrors = [err99];
                              } else {
                                vErrors.push(err99);
                              }
                              errors++;
                            } else {
                              errors = _errs159;
                              if (vErrors !== null) {
                                if (_errs159) {
                                  vErrors.length = _errs159;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                            var valid29 = _errs158 === errors;
                          } else {
                            var valid29 = true;
                          }
                          if (valid29) {
                            if (data.id !== void 0) {
                              const _errs167 = errors;
                              if (typeof data.id !== "string") {
                                const err100 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/8/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err100];
                                } else {
                                  vErrors.push(err100);
                                }
                                errors++;
                              }
                              var valid29 = _errs167 === errors;
                            } else {
                              var valid29 = true;
                            }
                            if (valid29) {
                              if (data.mcpAppResourceUri !== void 0) {
                                let data60 = data.mcpAppResourceUri;
                                const _errs169 = errors;
                                if (typeof data60 !== "string" && data60 !== null) {
                                  const err101 = { instancePath: instancePath + "/mcpAppResourceUri", schemaPath: "#/oneOf/8/properties/mcpAppResourceUri/type", keyword: "type", params: { type: schema50.oneOf[8].properties.mcpAppResourceUri.type } };
                                  if (vErrors === null) {
                                    vErrors = [err101];
                                  } else {
                                    vErrors.push(err101);
                                  }
                                  errors++;
                                }
                                var valid29 = _errs169 === errors;
                              } else {
                                var valid29 = true;
                              }
                              if (valid29) {
                                if (data.pluginId !== void 0) {
                                  let data61 = data.pluginId;
                                  const _errs171 = errors;
                                  if (typeof data61 !== "string" && data61 !== null) {
                                    const err102 = { instancePath: instancePath + "/pluginId", schemaPath: "#/oneOf/8/properties/pluginId/type", keyword: "type", params: { type: schema50.oneOf[8].properties.pluginId.type } };
                                    if (vErrors === null) {
                                      vErrors = [err102];
                                    } else {
                                      vErrors.push(err102);
                                    }
                                    errors++;
                                  }
                                  var valid29 = _errs171 === errors;
                                } else {
                                  var valid29 = true;
                                }
                                if (valid29) {
                                  if (data.readOnlyHint !== void 0) {
                                    let data62 = data.readOnlyHint;
                                    const _errs173 = errors;
                                    if (typeof data62 !== "boolean" && data62 !== null) {
                                      const err103 = { instancePath: instancePath + "/readOnlyHint", schemaPath: "#/oneOf/8/properties/readOnlyHint/type", keyword: "type", params: { type: schema50.oneOf[8].properties.readOnlyHint.type } };
                                      if (vErrors === null) {
                                        vErrors = [err103];
                                      } else {
                                        vErrors.push(err103);
                                      }
                                      errors++;
                                    }
                                    var valid29 = _errs173 === errors;
                                  } else {
                                    var valid29 = true;
                                  }
                                  if (valid29) {
                                    if (data.result !== void 0) {
                                      let data63 = data.result;
                                      const _errs175 = errors;
                                      const _errs176 = errors;
                                      let valid36 = false;
                                      const _errs177 = errors;
                                      const _errs178 = errors;
                                      if (errors === _errs178) {
                                        if (data63 && typeof data63 == "object" && !Array.isArray(data63)) {
                                          let missing12;
                                          if (data63.content === void 0 && (missing12 = "content")) {
                                            const err104 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/required", keyword: "required", params: { missingProperty: missing12 } };
                                            if (vErrors === null) {
                                              vErrors = [err104];
                                            } else {
                                              vErrors.push(err104);
                                            }
                                            errors++;
                                          } else {
                                            if (data63.content !== void 0) {
                                              const _errs180 = errors;
                                              if (errors === _errs180) {
                                                if (!Array.isArray(data63.content)) {
                                                  const err105 = { instancePath: instancePath + "/result/content", schemaPath: "#/definitions/v2/McpToolCallResult/properties/content/type", keyword: "type", params: { type: "array" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err105];
                                                  } else {
                                                    vErrors.push(err105);
                                                  }
                                                  errors++;
                                                }
                                              }
                                            }
                                          }
                                        } else {
                                          const err106 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/v2/McpToolCallResult/type", keyword: "type", params: { type: "object" } };
                                          if (vErrors === null) {
                                            vErrors = [err106];
                                          } else {
                                            vErrors.push(err106);
                                          }
                                          errors++;
                                        }
                                      }
                                      var _valid7 = _errs177 === errors;
                                      valid36 = valid36 || _valid7;
                                      if (!valid36) {
                                        const _errs182 = errors;
                                        if (data63 !== null) {
                                          const err107 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/8/properties/result/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                          if (vErrors === null) {
                                            vErrors = [err107];
                                          } else {
                                            vErrors.push(err107);
                                          }
                                          errors++;
                                        }
                                        var _valid7 = _errs182 === errors;
                                        valid36 = valid36 || _valid7;
                                      }
                                      if (!valid36) {
                                        const err108 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/8/properties/result/anyOf", keyword: "anyOf", params: {} };
                                        if (vErrors === null) {
                                          vErrors = [err108];
                                        } else {
                                          vErrors.push(err108);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs176;
                                        if (vErrors !== null) {
                                          if (_errs176) {
                                            vErrors.length = _errs176;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid29 = _errs175 === errors;
                                    } else {
                                      var valid29 = true;
                                    }
                                    if (valid29) {
                                      if (data.server !== void 0) {
                                        const _errs184 = errors;
                                        if (typeof data.server !== "string") {
                                          const err109 = { instancePath: instancePath + "/server", schemaPath: "#/oneOf/8/properties/server/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err109];
                                          } else {
                                            vErrors.push(err109);
                                          }
                                          errors++;
                                        }
                                        var valid29 = _errs184 === errors;
                                      } else {
                                        var valid29 = true;
                                      }
                                      if (valid29) {
                                        if (data.status !== void 0) {
                                          let data66 = data.status;
                                          const _errs186 = errors;
                                          if (typeof data66 !== "string") {
                                            const err110 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err110];
                                            } else {
                                              vErrors.push(err110);
                                            }
                                            errors++;
                                          }
                                          if (!(data66 === "inProgress" || data66 === "completed" || data66 === "failed")) {
                                            const err111 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/McpToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema75.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err111];
                                            } else {
                                              vErrors.push(err111);
                                            }
                                            errors++;
                                          }
                                          var valid29 = _errs186 === errors;
                                        } else {
                                          var valid29 = true;
                                        }
                                        if (valid29) {
                                          if (data.tool !== void 0) {
                                            const _errs189 = errors;
                                            if (typeof data.tool !== "string") {
                                              const err112 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/8/properties/tool/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err112];
                                              } else {
                                                vErrors.push(err112);
                                              }
                                              errors++;
                                            }
                                            var valid29 = _errs189 === errors;
                                          } else {
                                            var valid29 = true;
                                          }
                                          if (valid29) {
                                            if (data.type !== void 0) {
                                              let data68 = data.type;
                                              const _errs191 = errors;
                                              if (typeof data68 !== "string") {
                                                const err113 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err113];
                                                } else {
                                                  vErrors.push(err113);
                                                }
                                                errors++;
                                              }
                                              if (!(data68 === "mcpToolCall")) {
                                                const err114 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/8/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[8].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err114];
                                                } else {
                                                  vErrors.push(err114);
                                                }
                                                errors++;
                                              }
                                              var valid29 = _errs191 === errors;
                                            } else {
                                              var valid29 = true;
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
                    const err115 = { instancePath, schemaPath: "#/oneOf/8/type", keyword: "type", params: { type: "object" } };
                    if (vErrors === null) {
                      vErrors = [err115];
                    } else {
                      vErrors.push(err115);
                    }
                    errors++;
                  }
                }
                var _valid0 = _errs137 === errors;
                if (_valid0 && valid0) {
                  valid0 = false;
                  passing0 = [passing0, 8];
                } else {
                  if (_valid0) {
                    valid0 = true;
                    passing0 = 8;
                  }
                  const _errs193 = errors;
                  if (errors === _errs193) {
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      let missing13;
                      if (data.arguments === void 0 && (missing13 = "arguments") || data.id === void 0 && (missing13 = "id") || data.status === void 0 && (missing13 = "status") || data.tool === void 0 && (missing13 = "tool") || data.type === void 0 && (missing13 = "type")) {
                        const err116 = { instancePath, schemaPath: "#/oneOf/9/required", keyword: "required", params: { missingProperty: missing13 } };
                        if (vErrors === null) {
                          vErrors = [err116];
                        } else {
                          vErrors.push(err116);
                        }
                        errors++;
                      } else {
                        if (data.contentItems !== void 0) {
                          let data69 = data.contentItems;
                          const _errs195 = errors;
                          if (!Array.isArray(data69) && data69 !== null) {
                            const err117 = { instancePath: instancePath + "/contentItems", schemaPath: "#/oneOf/9/properties/contentItems/type", keyword: "type", params: { type: schema50.oneOf[9].properties.contentItems.type } };
                            if (vErrors === null) {
                              vErrors = [err117];
                            } else {
                              vErrors.push(err117);
                            }
                            errors++;
                          }
                          if (errors === _errs195) {
                            if (Array.isArray(data69)) {
                              var valid41 = true;
                              const len6 = data69.length;
                              for (let i6 = 0; i6 < len6; i6++) {
                                let data70 = data69[i6];
                                const _errs197 = errors;
                                const _errs199 = errors;
                                let valid43 = false;
                                let passing2 = null;
                                const _errs200 = errors;
                                if (errors === _errs200) {
                                  if (data70 && typeof data70 == "object" && !Array.isArray(data70)) {
                                    let missing14;
                                    if (data70.text === void 0 && (missing14 = "text") || data70.type === void 0 && (missing14 = "type")) {
                                      const err118 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/required", keyword: "required", params: { missingProperty: missing14 } };
                                      if (vErrors === null) {
                                        vErrors = [err118];
                                      } else {
                                        vErrors.push(err118);
                                      }
                                      errors++;
                                    } else {
                                      if (data70.text !== void 0) {
                                        const _errs202 = errors;
                                        if (typeof data70.text !== "string") {
                                          const err119 = { instancePath: instancePath + "/contentItems/" + i6 + "/text", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/text/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err119];
                                          } else {
                                            vErrors.push(err119);
                                          }
                                          errors++;
                                        }
                                        var valid44 = _errs202 === errors;
                                      } else {
                                        var valid44 = true;
                                      }
                                      if (valid44) {
                                        if (data70.type !== void 0) {
                                          let data72 = data70.type;
                                          const _errs204 = errors;
                                          if (typeof data72 !== "string") {
                                            const err120 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err120];
                                            } else {
                                              vErrors.push(err120);
                                            }
                                            errors++;
                                          }
                                          if (!(data72 === "inputText")) {
                                            const err121 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[0].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err121];
                                            } else {
                                              vErrors.push(err121);
                                            }
                                            errors++;
                                          }
                                          var valid44 = _errs204 === errors;
                                        } else {
                                          var valid44 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err122 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err122];
                                    } else {
                                      vErrors.push(err122);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid8 = _errs200 === errors;
                                if (_valid8) {
                                  valid43 = true;
                                  passing2 = 0;
                                }
                                const _errs206 = errors;
                                if (errors === _errs206) {
                                  if (data70 && typeof data70 == "object" && !Array.isArray(data70)) {
                                    let missing15;
                                    if (data70.imageUrl === void 0 && (missing15 = "imageUrl") || data70.type === void 0 && (missing15 = "type")) {
                                      const err123 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/required", keyword: "required", params: { missingProperty: missing15 } };
                                      if (vErrors === null) {
                                        vErrors = [err123];
                                      } else {
                                        vErrors.push(err123);
                                      }
                                      errors++;
                                    } else {
                                      if (data70.imageUrl !== void 0) {
                                        const _errs208 = errors;
                                        if (typeof data70.imageUrl !== "string") {
                                          const err124 = { instancePath: instancePath + "/contentItems/" + i6 + "/imageUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/imageUrl/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err124];
                                          } else {
                                            vErrors.push(err124);
                                          }
                                          errors++;
                                        }
                                        var valid45 = _errs208 === errors;
                                      } else {
                                        var valid45 = true;
                                      }
                                      if (valid45) {
                                        if (data70.type !== void 0) {
                                          let data74 = data70.type;
                                          const _errs210 = errors;
                                          if (typeof data74 !== "string") {
                                            const err125 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err125];
                                            } else {
                                              vErrors.push(err125);
                                            }
                                            errors++;
                                          }
                                          if (!(data74 === "inputImage")) {
                                            const err126 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[1].properties.type.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err126];
                                            } else {
                                              vErrors.push(err126);
                                            }
                                            errors++;
                                          }
                                          var valid45 = _errs210 === errors;
                                        } else {
                                          var valid45 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err127 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err127];
                                    } else {
                                      vErrors.push(err127);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid8 = _errs206 === errors;
                                if (_valid8 && valid43) {
                                  valid43 = false;
                                  passing2 = [passing2, 1];
                                } else {
                                  if (_valid8) {
                                    valid43 = true;
                                    passing2 = 1;
                                  }
                                  const _errs212 = errors;
                                  if (errors === _errs212) {
                                    if (data70 && typeof data70 == "object" && !Array.isArray(data70)) {
                                      let missing16;
                                      if (data70.audioUrl === void 0 && (missing16 = "audioUrl") || data70.type === void 0 && (missing16 = "type")) {
                                        const err128 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/required", keyword: "required", params: { missingProperty: missing16 } };
                                        if (vErrors === null) {
                                          vErrors = [err128];
                                        } else {
                                          vErrors.push(err128);
                                        }
                                        errors++;
                                      } else {
                                        if (data70.audioUrl !== void 0) {
                                          const _errs214 = errors;
                                          if (typeof data70.audioUrl !== "string") {
                                            const err129 = { instancePath: instancePath + "/contentItems/" + i6 + "/audioUrl", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/audioUrl/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err129];
                                            } else {
                                              vErrors.push(err129);
                                            }
                                            errors++;
                                          }
                                          var valid46 = _errs214 === errors;
                                        } else {
                                          var valid46 = true;
                                        }
                                        if (valid46) {
                                          if (data70.type !== void 0) {
                                            let data76 = data70.type;
                                            const _errs216 = errors;
                                            if (typeof data76 !== "string") {
                                              const err130 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err130];
                                              } else {
                                                vErrors.push(err130);
                                              }
                                              errors++;
                                            }
                                            if (!(data76 === "inputAudio")) {
                                              const err131 = { instancePath: instancePath + "/contentItems/" + i6 + "/type", schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema76.oneOf[2].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err131];
                                              } else {
                                                vErrors.push(err131);
                                              }
                                              errors++;
                                            }
                                            var valid46 = _errs216 === errors;
                                          } else {
                                            var valid46 = true;
                                          }
                                        }
                                      }
                                    } else {
                                      const err132 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err132];
                                      } else {
                                        vErrors.push(err132);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid8 = _errs212 === errors;
                                  if (_valid8 && valid43) {
                                    valid43 = false;
                                    passing2 = [passing2, 2];
                                  } else {
                                    if (_valid8) {
                                      valid43 = true;
                                      passing2 = 2;
                                    }
                                  }
                                }
                                if (!valid43) {
                                  const err133 = { instancePath: instancePath + "/contentItems/" + i6, schemaPath: "#/definitions/v2/DynamicToolCallOutputContentItem/oneOf", keyword: "oneOf", params: { passingSchemas: passing2 } };
                                  if (vErrors === null) {
                                    vErrors = [err133];
                                  } else {
                                    vErrors.push(err133);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs199;
                                  if (vErrors !== null) {
                                    if (_errs199) {
                                      vErrors.length = _errs199;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid41 = _errs197 === errors;
                                if (!valid41) {
                                  break;
                                }
                              }
                            }
                          }
                          var valid40 = _errs195 === errors;
                        } else {
                          var valid40 = true;
                        }
                        if (valid40) {
                          if (data.durationMs !== void 0) {
                            let data77 = data.durationMs;
                            const _errs218 = errors;
                            if (!(typeof data77 == "number" && (!(data77 % 1) && !isNaN(data77)) && isFinite(data77)) && data77 !== null) {
                              const err134 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/9/properties/durationMs/type", keyword: "type", params: { type: schema50.oneOf[9].properties.durationMs.type } };
                              if (vErrors === null) {
                                vErrors = [err134];
                              } else {
                                vErrors.push(err134);
                              }
                              errors++;
                            }
                            var valid40 = _errs218 === errors;
                          } else {
                            var valid40 = true;
                          }
                          if (valid40) {
                            if (data.id !== void 0) {
                              const _errs220 = errors;
                              if (typeof data.id !== "string") {
                                const err135 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/9/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err135];
                                } else {
                                  vErrors.push(err135);
                                }
                                errors++;
                              }
                              var valid40 = _errs220 === errors;
                            } else {
                              var valid40 = true;
                            }
                            if (valid40) {
                              if (data.namespace !== void 0) {
                                let data79 = data.namespace;
                                const _errs222 = errors;
                                if (typeof data79 !== "string" && data79 !== null) {
                                  const err136 = { instancePath: instancePath + "/namespace", schemaPath: "#/oneOf/9/properties/namespace/type", keyword: "type", params: { type: schema50.oneOf[9].properties.namespace.type } };
                                  if (vErrors === null) {
                                    vErrors = [err136];
                                  } else {
                                    vErrors.push(err136);
                                  }
                                  errors++;
                                }
                                var valid40 = _errs222 === errors;
                              } else {
                                var valid40 = true;
                              }
                              if (valid40) {
                                if (data.status !== void 0) {
                                  let data80 = data.status;
                                  const _errs224 = errors;
                                  if (typeof data80 !== "string") {
                                    const err137 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err137];
                                    } else {
                                      vErrors.push(err137);
                                    }
                                    errors++;
                                  }
                                  if (!(data80 === "inProgress" || data80 === "completed" || data80 === "failed")) {
                                    const err138 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/DynamicToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema77.enum } };
                                    if (vErrors === null) {
                                      vErrors = [err138];
                                    } else {
                                      vErrors.push(err138);
                                    }
                                    errors++;
                                  }
                                  var valid40 = _errs224 === errors;
                                } else {
                                  var valid40 = true;
                                }
                                if (valid40) {
                                  if (data.success !== void 0) {
                                    let data81 = data.success;
                                    const _errs227 = errors;
                                    if (typeof data81 !== "boolean" && data81 !== null) {
                                      const err139 = { instancePath: instancePath + "/success", schemaPath: "#/oneOf/9/properties/success/type", keyword: "type", params: { type: schema50.oneOf[9].properties.success.type } };
                                      if (vErrors === null) {
                                        vErrors = [err139];
                                      } else {
                                        vErrors.push(err139);
                                      }
                                      errors++;
                                    }
                                    var valid40 = _errs227 === errors;
                                  } else {
                                    var valid40 = true;
                                  }
                                  if (valid40) {
                                    if (data.tool !== void 0) {
                                      const _errs229 = errors;
                                      if (typeof data.tool !== "string") {
                                        const err140 = { instancePath: instancePath + "/tool", schemaPath: "#/oneOf/9/properties/tool/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err140];
                                        } else {
                                          vErrors.push(err140);
                                        }
                                        errors++;
                                      }
                                      var valid40 = _errs229 === errors;
                                    } else {
                                      var valid40 = true;
                                    }
                                    if (valid40) {
                                      if (data.type !== void 0) {
                                        let data83 = data.type;
                                        const _errs231 = errors;
                                        if (typeof data83 !== "string") {
                                          const err141 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err141];
                                          } else {
                                            vErrors.push(err141);
                                          }
                                          errors++;
                                        }
                                        if (!(data83 === "dynamicToolCall")) {
                                          const err142 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/9/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[9].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err142];
                                          } else {
                                            vErrors.push(err142);
                                          }
                                          errors++;
                                        }
                                        var valid40 = _errs231 === errors;
                                      } else {
                                        var valid40 = true;
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
                      const err143 = { instancePath, schemaPath: "#/oneOf/9/type", keyword: "type", params: { type: "object" } };
                      if (vErrors === null) {
                        vErrors = [err143];
                      } else {
                        vErrors.push(err143);
                      }
                      errors++;
                    }
                  }
                  var _valid0 = _errs193 === errors;
                  if (_valid0 && valid0) {
                    valid0 = false;
                    passing0 = [passing0, 9];
                  } else {
                    if (_valid0) {
                      valid0 = true;
                      passing0 = 9;
                    }
                    const _errs233 = errors;
                    if (errors === _errs233) {
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        let missing17;
                        if (data.agentsStates === void 0 && (missing17 = "agentsStates") || data.id === void 0 && (missing17 = "id") || data.receiverThreadIds === void 0 && (missing17 = "receiverThreadIds") || data.senderThreadId === void 0 && (missing17 = "senderThreadId") || data.status === void 0 && (missing17 = "status") || data.tool === void 0 && (missing17 = "tool") || data.type === void 0 && (missing17 = "type")) {
                          const err144 = { instancePath, schemaPath: "#/oneOf/10/required", keyword: "required", params: { missingProperty: missing17 } };
                          if (vErrors === null) {
                            vErrors = [err144];
                          } else {
                            vErrors.push(err144);
                          }
                          errors++;
                        } else {
                          if (data.agentsStates !== void 0) {
                            let data84 = data.agentsStates;
                            const _errs235 = errors;
                            if (errors === _errs235) {
                              if (data84 && typeof data84 == "object" && !Array.isArray(data84)) {
                                for (const key0 in data84) {
                                  const _errs238 = errors;
                                  if (!validate59(data84[key0], { instancePath: instancePath + "/agentsStates/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data84, parentDataProperty: key0, rootData })) {
                                    vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid49 = _errs238 === errors;
                                  if (!valid49) {
                                    break;
                                  }
                                }
                              } else {
                                const err145 = { instancePath: instancePath + "/agentsStates", schemaPath: "#/oneOf/10/properties/agentsStates/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err145];
                                } else {
                                  vErrors.push(err145);
                                }
                                errors++;
                              }
                            }
                            var valid48 = _errs235 === errors;
                          } else {
                            var valid48 = true;
                          }
                          if (valid48) {
                            if (data.id !== void 0) {
                              const _errs239 = errors;
                              if (typeof data.id !== "string") {
                                const err146 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/10/properties/id/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err146];
                                } else {
                                  vErrors.push(err146);
                                }
                                errors++;
                              }
                              var valid48 = _errs239 === errors;
                            } else {
                              var valid48 = true;
                            }
                            if (valid48) {
                              if (data.model !== void 0) {
                                let data87 = data.model;
                                const _errs241 = errors;
                                if (typeof data87 !== "string" && data87 !== null) {
                                  const err147 = { instancePath: instancePath + "/model", schemaPath: "#/oneOf/10/properties/model/type", keyword: "type", params: { type: schema50.oneOf[10].properties.model.type } };
                                  if (vErrors === null) {
                                    vErrors = [err147];
                                  } else {
                                    vErrors.push(err147);
                                  }
                                  errors++;
                                }
                                var valid48 = _errs241 === errors;
                              } else {
                                var valid48 = true;
                              }
                              if (valid48) {
                                if (data.prompt !== void 0) {
                                  let data88 = data.prompt;
                                  const _errs243 = errors;
                                  if (typeof data88 !== "string" && data88 !== null) {
                                    const err148 = { instancePath: instancePath + "/prompt", schemaPath: "#/oneOf/10/properties/prompt/type", keyword: "type", params: { type: schema50.oneOf[10].properties.prompt.type } };
                                    if (vErrors === null) {
                                      vErrors = [err148];
                                    } else {
                                      vErrors.push(err148);
                                    }
                                    errors++;
                                  }
                                  var valid48 = _errs243 === errors;
                                } else {
                                  var valid48 = true;
                                }
                                if (valid48) {
                                  if (data.reasoningEffort !== void 0) {
                                    let data89 = data.reasoningEffort;
                                    const _errs245 = errors;
                                    const _errs246 = errors;
                                    let valid50 = false;
                                    const _errs247 = errors;
                                    const _errs248 = errors;
                                    if (errors === _errs248) {
                                      if (typeof data89 === "string") {
                                        if (func2(data89) < 1) {
                                          const err149 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/minLength", keyword: "minLength", params: { limit: 1 } };
                                          if (vErrors === null) {
                                            vErrors = [err149];
                                          } else {
                                            vErrors.push(err149);
                                          }
                                          errors++;
                                        }
                                      } else {
                                        const err150 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/definitions/v2/ReasoningEffort/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err150];
                                        } else {
                                          vErrors.push(err150);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid9 = _errs247 === errors;
                                    valid50 = valid50 || _valid9;
                                    if (!valid50) {
                                      const _errs250 = errors;
                                      if (data89 !== null) {
                                        const err151 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/10/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                        if (vErrors === null) {
                                          vErrors = [err151];
                                        } else {
                                          vErrors.push(err151);
                                        }
                                        errors++;
                                      }
                                      var _valid9 = _errs250 === errors;
                                      valid50 = valid50 || _valid9;
                                    }
                                    if (!valid50) {
                                      const err152 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/oneOf/10/properties/reasoningEffort/anyOf", keyword: "anyOf", params: {} };
                                      if (vErrors === null) {
                                        vErrors = [err152];
                                      } else {
                                        vErrors.push(err152);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs246;
                                      if (vErrors !== null) {
                                        if (_errs246) {
                                          vErrors.length = _errs246;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                    var valid48 = _errs245 === errors;
                                  } else {
                                    var valid48 = true;
                                  }
                                  if (valid48) {
                                    if (data.receiverThreadIds !== void 0) {
                                      let data90 = data.receiverThreadIds;
                                      const _errs252 = errors;
                                      if (errors === _errs252) {
                                        if (Array.isArray(data90)) {
                                          var valid52 = true;
                                          const len7 = data90.length;
                                          for (let i7 = 0; i7 < len7; i7++) {
                                            const _errs254 = errors;
                                            if (typeof data90[i7] !== "string") {
                                              const err153 = { instancePath: instancePath + "/receiverThreadIds/" + i7, schemaPath: "#/oneOf/10/properties/receiverThreadIds/items/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err153];
                                              } else {
                                                vErrors.push(err153);
                                              }
                                              errors++;
                                            }
                                            var valid52 = _errs254 === errors;
                                            if (!valid52) {
                                              break;
                                            }
                                          }
                                        } else {
                                          const err154 = { instancePath: instancePath + "/receiverThreadIds", schemaPath: "#/oneOf/10/properties/receiverThreadIds/type", keyword: "type", params: { type: "array" } };
                                          if (vErrors === null) {
                                            vErrors = [err154];
                                          } else {
                                            vErrors.push(err154);
                                          }
                                          errors++;
                                        }
                                      }
                                      var valid48 = _errs252 === errors;
                                    } else {
                                      var valid48 = true;
                                    }
                                    if (valid48) {
                                      if (data.senderThreadId !== void 0) {
                                        const _errs256 = errors;
                                        if (typeof data.senderThreadId !== "string") {
                                          const err155 = { instancePath: instancePath + "/senderThreadId", schemaPath: "#/oneOf/10/properties/senderThreadId/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err155];
                                          } else {
                                            vErrors.push(err155);
                                          }
                                          errors++;
                                        }
                                        var valid48 = _errs256 === errors;
                                      } else {
                                        var valid48 = true;
                                      }
                                      if (valid48) {
                                        if (data.status !== void 0) {
                                          let data93 = data.status;
                                          const _errs258 = errors;
                                          if (typeof data93 !== "string") {
                                            const err156 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err156];
                                            } else {
                                              vErrors.push(err156);
                                            }
                                            errors++;
                                          }
                                          if (!(data93 === "inProgress" || data93 === "completed" || data93 === "failed" || data93 === "interrupted")) {
                                            const err157 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/CollabAgentToolCallStatus/enum", keyword: "enum", params: { allowedValues: schema81.enum } };
                                            if (vErrors === null) {
                                              vErrors = [err157];
                                            } else {
                                              vErrors.push(err157);
                                            }
                                            errors++;
                                          }
                                          var valid48 = _errs258 === errors;
                                        } else {
                                          var valid48 = true;
                                        }
                                        if (valid48) {
                                          if (data.tool !== void 0) {
                                            let data94 = data.tool;
                                            const _errs262 = errors;
                                            if (typeof data94 !== "string") {
                                              const err158 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err158];
                                              } else {
                                                vErrors.push(err158);
                                              }
                                              errors++;
                                            }
                                            if (!(data94 === "spawnAgent" || data94 === "sendInput" || data94 === "resumeAgent" || data94 === "wait" || data94 === "closeAgent" || data94 === "sendMessage" || data94 === "followupTask" || data94 === "interruptAgent" || data94 === "listAgents")) {
                                              const err159 = { instancePath: instancePath + "/tool", schemaPath: "#/definitions/v2/CollabAgentTool/enum", keyword: "enum", params: { allowedValues: schema82.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err159];
                                              } else {
                                                vErrors.push(err159);
                                              }
                                              errors++;
                                            }
                                            var valid48 = _errs262 === errors;
                                          } else {
                                            var valid48 = true;
                                          }
                                          if (valid48) {
                                            if (data.type !== void 0) {
                                              let data95 = data.type;
                                              const _errs266 = errors;
                                              if (typeof data95 !== "string") {
                                                const err160 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err160];
                                                } else {
                                                  vErrors.push(err160);
                                                }
                                                errors++;
                                              }
                                              if (!(data95 === "collabAgentToolCall")) {
                                                const err161 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/10/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[10].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err161];
                                                } else {
                                                  vErrors.push(err161);
                                                }
                                                errors++;
                                              }
                                              var valid48 = _errs266 === errors;
                                            } else {
                                              var valid48 = true;
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
                        const err162 = { instancePath, schemaPath: "#/oneOf/10/type", keyword: "type", params: { type: "object" } };
                        if (vErrors === null) {
                          vErrors = [err162];
                        } else {
                          vErrors.push(err162);
                        }
                        errors++;
                      }
                    }
                    var _valid0 = _errs233 === errors;
                    if (_valid0 && valid0) {
                      valid0 = false;
                      passing0 = [passing0, 10];
                    } else {
                      if (_valid0) {
                        valid0 = true;
                        passing0 = 10;
                      }
                      const _errs268 = errors;
                      if (errors === _errs268) {
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          let missing18;
                          if (data.agentPath === void 0 && (missing18 = "agentPath") || data.agentThreadId === void 0 && (missing18 = "agentThreadId") || data.id === void 0 && (missing18 = "id") || data.kind === void 0 && (missing18 = "kind") || data.type === void 0 && (missing18 = "type")) {
                            const err163 = { instancePath, schemaPath: "#/oneOf/11/required", keyword: "required", params: { missingProperty: missing18 } };
                            if (vErrors === null) {
                              vErrors = [err163];
                            } else {
                              vErrors.push(err163);
                            }
                            errors++;
                          } else {
                            if (data.agentPath !== void 0) {
                              const _errs270 = errors;
                              if (typeof data.agentPath !== "string") {
                                const err164 = { instancePath: instancePath + "/agentPath", schemaPath: "#/oneOf/11/properties/agentPath/type", keyword: "type", params: { type: "string" } };
                                if (vErrors === null) {
                                  vErrors = [err164];
                                } else {
                                  vErrors.push(err164);
                                }
                                errors++;
                              }
                              var valid57 = _errs270 === errors;
                            } else {
                              var valid57 = true;
                            }
                            if (valid57) {
                              if (data.agentThreadId !== void 0) {
                                const _errs272 = errors;
                                if (typeof data.agentThreadId !== "string") {
                                  const err165 = { instancePath: instancePath + "/agentThreadId", schemaPath: "#/oneOf/11/properties/agentThreadId/type", keyword: "type", params: { type: "string" } };
                                  if (vErrors === null) {
                                    vErrors = [err165];
                                  } else {
                                    vErrors.push(err165);
                                  }
                                  errors++;
                                }
                                var valid57 = _errs272 === errors;
                              } else {
                                var valid57 = true;
                              }
                              if (valid57) {
                                if (data.id !== void 0) {
                                  const _errs274 = errors;
                                  if (typeof data.id !== "string") {
                                    const err166 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/11/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err166];
                                    } else {
                                      vErrors.push(err166);
                                    }
                                    errors++;
                                  }
                                  var valid57 = _errs274 === errors;
                                } else {
                                  var valid57 = true;
                                }
                                if (valid57) {
                                  if (data.kind !== void 0) {
                                    let data99 = data.kind;
                                    const _errs276 = errors;
                                    if (typeof data99 !== "string") {
                                      const err167 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err167];
                                      } else {
                                        vErrors.push(err167);
                                      }
                                      errors++;
                                    }
                                    if (!(data99 === "started" || data99 === "interacted" || data99 === "interrupted" || data99 === "completed")) {
                                      const err168 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/v2/SubAgentActivityKind/enum", keyword: "enum", params: { allowedValues: schema83.enum } };
                                      if (vErrors === null) {
                                        vErrors = [err168];
                                      } else {
                                        vErrors.push(err168);
                                      }
                                      errors++;
                                    }
                                    var valid57 = _errs276 === errors;
                                  } else {
                                    var valid57 = true;
                                  }
                                  if (valid57) {
                                    if (data.type !== void 0) {
                                      let data100 = data.type;
                                      const _errs279 = errors;
                                      if (typeof data100 !== "string") {
                                        const err169 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err169];
                                        } else {
                                          vErrors.push(err169);
                                        }
                                        errors++;
                                      }
                                      if (!(data100 === "subAgentActivity")) {
                                        const err170 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/11/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[11].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err170];
                                        } else {
                                          vErrors.push(err170);
                                        }
                                        errors++;
                                      }
                                      var valid57 = _errs279 === errors;
                                    } else {
                                      var valid57 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          const err171 = { instancePath, schemaPath: "#/oneOf/11/type", keyword: "type", params: { type: "object" } };
                          if (vErrors === null) {
                            vErrors = [err171];
                          } else {
                            vErrors.push(err171);
                          }
                          errors++;
                        }
                      }
                      var _valid0 = _errs268 === errors;
                      if (_valid0 && valid0) {
                        valid0 = false;
                        passing0 = [passing0, 11];
                      } else {
                        if (_valid0) {
                          valid0 = true;
                          passing0 = 11;
                        }
                        const _errs281 = errors;
                        if (errors === _errs281) {
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            let missing19;
                            if (data.id === void 0 && (missing19 = "id") || data.query === void 0 && (missing19 = "query") || data.type === void 0 && (missing19 = "type")) {
                              const err172 = { instancePath, schemaPath: "#/oneOf/12/required", keyword: "required", params: { missingProperty: missing19 } };
                              if (vErrors === null) {
                                vErrors = [err172];
                              } else {
                                vErrors.push(err172);
                              }
                              errors++;
                            } else {
                              if (data.action !== void 0) {
                                let data101 = data.action;
                                const _errs283 = errors;
                                const _errs284 = errors;
                                let valid60 = false;
                                const _errs285 = errors;
                                const _errs287 = errors;
                                let valid62 = false;
                                let passing3 = null;
                                const _errs288 = errors;
                                if (errors === _errs288) {
                                  if (data101 && typeof data101 == "object" && !Array.isArray(data101)) {
                                    let missing20;
                                    if (data101.type === void 0 && (missing20 = "type")) {
                                      const err173 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/required", keyword: "required", params: { missingProperty: missing20 } };
                                      if (vErrors === null) {
                                        vErrors = [err173];
                                      } else {
                                        vErrors.push(err173);
                                      }
                                      errors++;
                                    } else {
                                      if (data101.queries !== void 0) {
                                        let data102 = data101.queries;
                                        const _errs290 = errors;
                                        if (!Array.isArray(data102) && data102 !== null) {
                                          const err174 = { instancePath: instancePath + "/action/queries", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/type", keyword: "type", params: { type: schema84.oneOf[0].properties.queries.type } };
                                          if (vErrors === null) {
                                            vErrors = [err174];
                                          } else {
                                            vErrors.push(err174);
                                          }
                                          errors++;
                                        }
                                        if (errors === _errs290) {
                                          if (Array.isArray(data102)) {
                                            var valid64 = true;
                                            const len8 = data102.length;
                                            for (let i8 = 0; i8 < len8; i8++) {
                                              const _errs292 = errors;
                                              if (typeof data102[i8] !== "string") {
                                                const err175 = { instancePath: instancePath + "/action/queries/" + i8, schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/queries/items/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err175];
                                                } else {
                                                  vErrors.push(err175);
                                                }
                                                errors++;
                                              }
                                              var valid64 = _errs292 === errors;
                                              if (!valid64) {
                                                break;
                                              }
                                            }
                                          }
                                        }
                                        var valid63 = _errs290 === errors;
                                      } else {
                                        var valid63 = true;
                                      }
                                      if (valid63) {
                                        if (data101.query !== void 0) {
                                          let data104 = data101.query;
                                          const _errs294 = errors;
                                          if (typeof data104 !== "string" && data104 !== null) {
                                            const err176 = { instancePath: instancePath + "/action/query", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/query/type", keyword: "type", params: { type: schema84.oneOf[0].properties.query.type } };
                                            if (vErrors === null) {
                                              vErrors = [err176];
                                            } else {
                                              vErrors.push(err176);
                                            }
                                            errors++;
                                          }
                                          var valid63 = _errs294 === errors;
                                        } else {
                                          var valid63 = true;
                                        }
                                        if (valid63) {
                                          if (data101.type !== void 0) {
                                            let data105 = data101.type;
                                            const _errs296 = errors;
                                            if (typeof data105 !== "string") {
                                              const err177 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err177];
                                              } else {
                                                vErrors.push(err177);
                                              }
                                              errors++;
                                            }
                                            if (!(data105 === "search")) {
                                              const err178 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema84.oneOf[0].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err178];
                                              } else {
                                                vErrors.push(err178);
                                              }
                                              errors++;
                                            }
                                            var valid63 = _errs296 === errors;
                                          } else {
                                            var valid63 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err179 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err179];
                                    } else {
                                      vErrors.push(err179);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid11 = _errs288 === errors;
                                if (_valid11) {
                                  valid62 = true;
                                  passing3 = 0;
                                }
                                const _errs298 = errors;
                                if (errors === _errs298) {
                                  if (data101 && typeof data101 == "object" && !Array.isArray(data101)) {
                                    let missing21;
                                    if (data101.type === void 0 && (missing21 = "type")) {
                                      const err180 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/required", keyword: "required", params: { missingProperty: missing21 } };
                                      if (vErrors === null) {
                                        vErrors = [err180];
                                      } else {
                                        vErrors.push(err180);
                                      }
                                      errors++;
                                    } else {
                                      if (data101.type !== void 0) {
                                        let data106 = data101.type;
                                        const _errs300 = errors;
                                        if (typeof data106 !== "string") {
                                          const err181 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err181];
                                          } else {
                                            vErrors.push(err181);
                                          }
                                          errors++;
                                        }
                                        if (!(data106 === "openPage")) {
                                          const err182 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema84.oneOf[1].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err182];
                                          } else {
                                            vErrors.push(err182);
                                          }
                                          errors++;
                                        }
                                        var valid65 = _errs300 === errors;
                                      } else {
                                        var valid65 = true;
                                      }
                                      if (valid65) {
                                        if (data101.url !== void 0) {
                                          let data107 = data101.url;
                                          const _errs302 = errors;
                                          if (typeof data107 !== "string" && data107 !== null) {
                                            const err183 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/properties/url/type", keyword: "type", params: { type: schema84.oneOf[1].properties.url.type } };
                                            if (vErrors === null) {
                                              vErrors = [err183];
                                            } else {
                                              vErrors.push(err183);
                                            }
                                            errors++;
                                          }
                                          var valid65 = _errs302 === errors;
                                        } else {
                                          var valid65 = true;
                                        }
                                      }
                                    }
                                  } else {
                                    const err184 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/1/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err184];
                                    } else {
                                      vErrors.push(err184);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid11 = _errs298 === errors;
                                if (_valid11 && valid62) {
                                  valid62 = false;
                                  passing3 = [passing3, 1];
                                } else {
                                  if (_valid11) {
                                    valid62 = true;
                                    passing3 = 1;
                                  }
                                  const _errs304 = errors;
                                  if (errors === _errs304) {
                                    if (data101 && typeof data101 == "object" && !Array.isArray(data101)) {
                                      let missing22;
                                      if (data101.type === void 0 && (missing22 = "type")) {
                                        const err185 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/required", keyword: "required", params: { missingProperty: missing22 } };
                                        if (vErrors === null) {
                                          vErrors = [err185];
                                        } else {
                                          vErrors.push(err185);
                                        }
                                        errors++;
                                      } else {
                                        if (data101.pattern !== void 0) {
                                          let data108 = data101.pattern;
                                          const _errs306 = errors;
                                          if (typeof data108 !== "string" && data108 !== null) {
                                            const err186 = { instancePath: instancePath + "/action/pattern", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/pattern/type", keyword: "type", params: { type: schema84.oneOf[2].properties.pattern.type } };
                                            if (vErrors === null) {
                                              vErrors = [err186];
                                            } else {
                                              vErrors.push(err186);
                                            }
                                            errors++;
                                          }
                                          var valid66 = _errs306 === errors;
                                        } else {
                                          var valid66 = true;
                                        }
                                        if (valid66) {
                                          if (data101.type !== void 0) {
                                            let data109 = data101.type;
                                            const _errs308 = errors;
                                            if (typeof data109 !== "string") {
                                              const err187 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err187];
                                              } else {
                                                vErrors.push(err187);
                                              }
                                              errors++;
                                            }
                                            if (!(data109 === "findInPage")) {
                                              const err188 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema84.oneOf[2].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err188];
                                              } else {
                                                vErrors.push(err188);
                                              }
                                              errors++;
                                            }
                                            var valid66 = _errs308 === errors;
                                          } else {
                                            var valid66 = true;
                                          }
                                          if (valid66) {
                                            if (data101.url !== void 0) {
                                              let data110 = data101.url;
                                              const _errs310 = errors;
                                              if (typeof data110 !== "string" && data110 !== null) {
                                                const err189 = { instancePath: instancePath + "/action/url", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/properties/url/type", keyword: "type", params: { type: schema84.oneOf[2].properties.url.type } };
                                                if (vErrors === null) {
                                                  vErrors = [err189];
                                                } else {
                                                  vErrors.push(err189);
                                                }
                                                errors++;
                                              }
                                              var valid66 = _errs310 === errors;
                                            } else {
                                              var valid66 = true;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err190 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/2/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err190];
                                      } else {
                                        vErrors.push(err190);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid11 = _errs304 === errors;
                                  if (_valid11 && valid62) {
                                    valid62 = false;
                                    passing3 = [passing3, 2];
                                  } else {
                                    if (_valid11) {
                                      valid62 = true;
                                      passing3 = 2;
                                    }
                                    const _errs312 = errors;
                                    if (errors === _errs312) {
                                      if (data101 && typeof data101 == "object" && !Array.isArray(data101)) {
                                        let missing23;
                                        if (data101.type === void 0 && (missing23 = "type")) {
                                          const err191 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/required", keyword: "required", params: { missingProperty: missing23 } };
                                          if (vErrors === null) {
                                            vErrors = [err191];
                                          } else {
                                            vErrors.push(err191);
                                          }
                                          errors++;
                                        } else {
                                          if (data101.type !== void 0) {
                                            let data111 = data101.type;
                                            if (typeof data111 !== "string") {
                                              const err192 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err192];
                                              } else {
                                                vErrors.push(err192);
                                              }
                                              errors++;
                                            }
                                            if (!(data111 === "other")) {
                                              const err193 = { instancePath: instancePath + "/action/type", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema84.oneOf[3].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err193];
                                              } else {
                                                vErrors.push(err193);
                                              }
                                              errors++;
                                            }
                                          }
                                        }
                                      } else {
                                        const err194 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf/3/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err194];
                                        } else {
                                          vErrors.push(err194);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid11 = _errs312 === errors;
                                    if (_valid11 && valid62) {
                                      valid62 = false;
                                      passing3 = [passing3, 3];
                                    } else {
                                      if (_valid11) {
                                        valid62 = true;
                                        passing3 = 3;
                                      }
                                    }
                                  }
                                }
                                if (!valid62) {
                                  const err195 = { instancePath: instancePath + "/action", schemaPath: "#/definitions/v2/WebSearchAction/oneOf", keyword: "oneOf", params: { passingSchemas: passing3 } };
                                  if (vErrors === null) {
                                    vErrors = [err195];
                                  } else {
                                    vErrors.push(err195);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs287;
                                  if (vErrors !== null) {
                                    if (_errs287) {
                                      vErrors.length = _errs287;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var _valid10 = _errs285 === errors;
                                valid60 = valid60 || _valid10;
                                if (!valid60) {
                                  const _errs316 = errors;
                                  if (data101 !== null) {
                                    const err196 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/12/properties/action/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                    if (vErrors === null) {
                                      vErrors = [err196];
                                    } else {
                                      vErrors.push(err196);
                                    }
                                    errors++;
                                  }
                                  var _valid10 = _errs316 === errors;
                                  valid60 = valid60 || _valid10;
                                }
                                if (!valid60) {
                                  const err197 = { instancePath: instancePath + "/action", schemaPath: "#/oneOf/12/properties/action/anyOf", keyword: "anyOf", params: {} };
                                  if (vErrors === null) {
                                    vErrors = [err197];
                                  } else {
                                    vErrors.push(err197);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs284;
                                  if (vErrors !== null) {
                                    if (_errs284) {
                                      vErrors.length = _errs284;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid59 = _errs283 === errors;
                              } else {
                                var valid59 = true;
                              }
                              if (valid59) {
                                if (data.id !== void 0) {
                                  const _errs318 = errors;
                                  if (typeof data.id !== "string") {
                                    const err198 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/12/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err198];
                                    } else {
                                      vErrors.push(err198);
                                    }
                                    errors++;
                                  }
                                  var valid59 = _errs318 === errors;
                                } else {
                                  var valid59 = true;
                                }
                                if (valid59) {
                                  if (data.query !== void 0) {
                                    const _errs320 = errors;
                                    if (typeof data.query !== "string") {
                                      const err199 = { instancePath: instancePath + "/query", schemaPath: "#/oneOf/12/properties/query/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err199];
                                      } else {
                                        vErrors.push(err199);
                                      }
                                      errors++;
                                    }
                                    var valid59 = _errs320 === errors;
                                  } else {
                                    var valid59 = true;
                                  }
                                  if (valid59) {
                                    if (data.results !== void 0) {
                                      let data114 = data.results;
                                      const _errs322 = errors;
                                      if (!Array.isArray(data114) && data114 !== null) {
                                        const err200 = { instancePath: instancePath + "/results", schemaPath: "#/oneOf/12/properties/results/type", keyword: "type", params: { type: schema50.oneOf[12].properties.results.type } };
                                        if (vErrors === null) {
                                          vErrors = [err200];
                                        } else {
                                          vErrors.push(err200);
                                        }
                                        errors++;
                                      }
                                      var valid59 = _errs322 === errors;
                                    } else {
                                      var valid59 = true;
                                    }
                                    if (valid59) {
                                      if (data.type !== void 0) {
                                        let data115 = data.type;
                                        const _errs324 = errors;
                                        if (typeof data115 !== "string") {
                                          const err201 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err201];
                                          } else {
                                            vErrors.push(err201);
                                          }
                                          errors++;
                                        }
                                        if (!(data115 === "webSearch")) {
                                          const err202 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/12/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[12].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err202];
                                          } else {
                                            vErrors.push(err202);
                                          }
                                          errors++;
                                        }
                                        var valid59 = _errs324 === errors;
                                      } else {
                                        var valid59 = true;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            const err203 = { instancePath, schemaPath: "#/oneOf/12/type", keyword: "type", params: { type: "object" } };
                            if (vErrors === null) {
                              vErrors = [err203];
                            } else {
                              vErrors.push(err203);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs281 === errors;
                        if (_valid0 && valid0) {
                          valid0 = false;
                          passing0 = [passing0, 12];
                        } else {
                          if (_valid0) {
                            valid0 = true;
                            passing0 = 12;
                          }
                          const _errs326 = errors;
                          if (errors === _errs326) {
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              let missing24;
                              if (data.id === void 0 && (missing24 = "id") || data.path === void 0 && (missing24 = "path") || data.type === void 0 && (missing24 = "type")) {
                                const err204 = { instancePath, schemaPath: "#/oneOf/13/required", keyword: "required", params: { missingProperty: missing24 } };
                                if (vErrors === null) {
                                  vErrors = [err204];
                                } else {
                                  vErrors.push(err204);
                                }
                                errors++;
                              } else {
                                if (data.id !== void 0) {
                                  const _errs328 = errors;
                                  if (typeof data.id !== "string") {
                                    const err205 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/13/properties/id/type", keyword: "type", params: { type: "string" } };
                                    if (vErrors === null) {
                                      vErrors = [err205];
                                    } else {
                                      vErrors.push(err205);
                                    }
                                    errors++;
                                  }
                                  var valid68 = _errs328 === errors;
                                } else {
                                  var valid68 = true;
                                }
                                if (valid68) {
                                  if (data.path !== void 0) {
                                    const _errs330 = errors;
                                    if (typeof data.path !== "string") {
                                      const err206 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } };
                                      if (vErrors === null) {
                                        vErrors = [err206];
                                      } else {
                                        vErrors.push(err206);
                                      }
                                      errors++;
                                    }
                                    var valid68 = _errs330 === errors;
                                  } else {
                                    var valid68 = true;
                                  }
                                  if (valid68) {
                                    if (data.type !== void 0) {
                                      let data118 = data.type;
                                      const _errs333 = errors;
                                      if (typeof data118 !== "string") {
                                        const err207 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err207];
                                        } else {
                                          vErrors.push(err207);
                                        }
                                        errors++;
                                      }
                                      if (!(data118 === "imageView")) {
                                        const err208 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/13/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[13].properties.type.enum } };
                                        if (vErrors === null) {
                                          vErrors = [err208];
                                        } else {
                                          vErrors.push(err208);
                                        }
                                        errors++;
                                      }
                                      var valid68 = _errs333 === errors;
                                    } else {
                                      var valid68 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err209 = { instancePath, schemaPath: "#/oneOf/13/type", keyword: "type", params: { type: "object" } };
                              if (vErrors === null) {
                                vErrors = [err209];
                              } else {
                                vErrors.push(err209);
                              }
                              errors++;
                            }
                          }
                          var _valid0 = _errs326 === errors;
                          if (_valid0 && valid0) {
                            valid0 = false;
                            passing0 = [passing0, 13];
                          } else {
                            if (_valid0) {
                              valid0 = true;
                              passing0 = 13;
                            }
                            const _errs335 = errors;
                            if (errors === _errs335) {
                              if (data && typeof data == "object" && !Array.isArray(data)) {
                                let missing25;
                                if (data.durationMs === void 0 && (missing25 = "durationMs") || data.id === void 0 && (missing25 = "id") || data.type === void 0 && (missing25 = "type")) {
                                  const err210 = { instancePath, schemaPath: "#/oneOf/14/required", keyword: "required", params: { missingProperty: missing25 } };
                                  if (vErrors === null) {
                                    vErrors = [err210];
                                  } else {
                                    vErrors.push(err210);
                                  }
                                  errors++;
                                } else {
                                  if (data.durationMs !== void 0) {
                                    let data119 = data.durationMs;
                                    const _errs337 = errors;
                                    if (!(typeof data119 == "number" && (!(data119 % 1) && !isNaN(data119)) && isFinite(data119))) {
                                      const err211 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/14/properties/durationMs/type", keyword: "type", params: { type: "integer" } };
                                      if (vErrors === null) {
                                        vErrors = [err211];
                                      } else {
                                        vErrors.push(err211);
                                      }
                                      errors++;
                                    }
                                    if (errors === _errs337) {
                                      if (typeof data119 == "number" && isFinite(data119)) {
                                        if (data119 < 0 || isNaN(data119)) {
                                          const err212 = { instancePath: instancePath + "/durationMs", schemaPath: "#/oneOf/14/properties/durationMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 } };
                                          if (vErrors === null) {
                                            vErrors = [err212];
                                          } else {
                                            vErrors.push(err212);
                                          }
                                          errors++;
                                        }
                                      }
                                    }
                                    var valid70 = _errs337 === errors;
                                  } else {
                                    var valid70 = true;
                                  }
                                  if (valid70) {
                                    if (data.id !== void 0) {
                                      const _errs339 = errors;
                                      if (typeof data.id !== "string") {
                                        const err213 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/14/properties/id/type", keyword: "type", params: { type: "string" } };
                                        if (vErrors === null) {
                                          vErrors = [err213];
                                        } else {
                                          vErrors.push(err213);
                                        }
                                        errors++;
                                      }
                                      var valid70 = _errs339 === errors;
                                    } else {
                                      var valid70 = true;
                                    }
                                    if (valid70) {
                                      if (data.type !== void 0) {
                                        let data121 = data.type;
                                        const _errs341 = errors;
                                        if (typeof data121 !== "string") {
                                          const err214 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err214];
                                          } else {
                                            vErrors.push(err214);
                                          }
                                          errors++;
                                        }
                                        if (!(data121 === "sleep")) {
                                          const err215 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/14/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[14].properties.type.enum } };
                                          if (vErrors === null) {
                                            vErrors = [err215];
                                          } else {
                                            vErrors.push(err215);
                                          }
                                          errors++;
                                        }
                                        var valid70 = _errs341 === errors;
                                      } else {
                                        var valid70 = true;
                                      }
                                    }
                                  }
                                }
                              } else {
                                const err216 = { instancePath, schemaPath: "#/oneOf/14/type", keyword: "type", params: { type: "object" } };
                                if (vErrors === null) {
                                  vErrors = [err216];
                                } else {
                                  vErrors.push(err216);
                                }
                                errors++;
                              }
                            }
                            var _valid0 = _errs335 === errors;
                            if (_valid0 && valid0) {
                              valid0 = false;
                              passing0 = [passing0, 14];
                            } else {
                              if (_valid0) {
                                valid0 = true;
                                passing0 = 14;
                              }
                              const _errs343 = errors;
                              if (errors === _errs343) {
                                if (data && typeof data == "object" && !Array.isArray(data)) {
                                  let missing26;
                                  if (data.id === void 0 && (missing26 = "id") || data.result === void 0 && (missing26 = "result") || data.status === void 0 && (missing26 = "status") || data.type === void 0 && (missing26 = "type")) {
                                    const err217 = { instancePath, schemaPath: "#/oneOf/15/required", keyword: "required", params: { missingProperty: missing26 } };
                                    if (vErrors === null) {
                                      vErrors = [err217];
                                    } else {
                                      vErrors.push(err217);
                                    }
                                    errors++;
                                  } else {
                                    if (data.failure !== void 0) {
                                      let data122 = data.failure;
                                      const _errs345 = errors;
                                      const _errs346 = errors;
                                      let valid72 = false;
                                      const _errs347 = errors;
                                      const _errs349 = errors;
                                      let valid74 = false;
                                      let passing4 = null;
                                      const _errs350 = errors;
                                      if (errors === _errs350) {
                                        if (data122 && typeof data122 == "object" && !Array.isArray(data122)) {
                                          let missing27;
                                          if (data122.limitId === void 0 && (missing27 = "limitId") || data122.type === void 0 && (missing27 = "type")) {
                                            const err218 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/required", keyword: "required", params: { missingProperty: missing27 } };
                                            if (vErrors === null) {
                                              vErrors = [err218];
                                            } else {
                                              vErrors.push(err218);
                                            }
                                            errors++;
                                          } else {
                                            if (data122.limitId !== void 0) {
                                              const _errs352 = errors;
                                              if (typeof data122.limitId !== "string") {
                                                const err219 = { instancePath: instancePath + "/failure/limitId", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/limitId/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err219];
                                                } else {
                                                  vErrors.push(err219);
                                                }
                                                errors++;
                                              }
                                              var valid75 = _errs352 === errors;
                                            } else {
                                              var valid75 = true;
                                            }
                                            if (valid75) {
                                              if (data122.resetsAt !== void 0) {
                                                let data124 = data122.resetsAt;
                                                const _errs354 = errors;
                                                if (!(typeof data124 == "number" && (!(data124 % 1) && !isNaN(data124)) && isFinite(data124)) && data124 !== null) {
                                                  const err220 = { instancePath: instancePath + "/failure/resetsAt", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/resetsAt/type", keyword: "type", params: { type: schema86.oneOf[0].properties.resetsAt.type } };
                                                  if (vErrors === null) {
                                                    vErrors = [err220];
                                                  } else {
                                                    vErrors.push(err220);
                                                  }
                                                  errors++;
                                                }
                                                var valid75 = _errs354 === errors;
                                              } else {
                                                var valid75 = true;
                                              }
                                              if (valid75) {
                                                if (data122.type !== void 0) {
                                                  let data125 = data122.type;
                                                  const _errs356 = errors;
                                                  if (typeof data125 !== "string") {
                                                    const err221 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/type", keyword: "type", params: { type: "string" } };
                                                    if (vErrors === null) {
                                                      vErrors = [err221];
                                                    } else {
                                                      vErrors.push(err221);
                                                    }
                                                    errors++;
                                                  }
                                                  if (!(data125 === "usageLimitExceeded")) {
                                                    const err222 = { instancePath: instancePath + "/failure/type", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema86.oneOf[0].properties.type.enum } };
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
                                              }
                                            }
                                          }
                                        } else {
                                          const err223 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf/0/type", keyword: "type", params: { type: "object" } };
                                          if (vErrors === null) {
                                            vErrors = [err223];
                                          } else {
                                            vErrors.push(err223);
                                          }
                                          errors++;
                                        }
                                      }
                                      var _valid13 = _errs350 === errors;
                                      if (_valid13) {
                                        valid74 = true;
                                        passing4 = 0;
                                      }
                                      if (!valid74) {
                                        const err224 = { instancePath: instancePath + "/failure", schemaPath: "#/definitions/v2/ImageGenerationFailure/oneOf", keyword: "oneOf", params: { passingSchemas: passing4 } };
                                        if (vErrors === null) {
                                          vErrors = [err224];
                                        } else {
                                          vErrors.push(err224);
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
                                      var _valid12 = _errs347 === errors;
                                      valid72 = valid72 || _valid12;
                                      if (!valid72) {
                                        const _errs358 = errors;
                                        if (data122 !== null) {
                                          const err225 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/15/properties/failure/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                          if (vErrors === null) {
                                            vErrors = [err225];
                                          } else {
                                            vErrors.push(err225);
                                          }
                                          errors++;
                                        }
                                        var _valid12 = _errs358 === errors;
                                        valid72 = valid72 || _valid12;
                                      }
                                      if (!valid72) {
                                        const err226 = { instancePath: instancePath + "/failure", schemaPath: "#/oneOf/15/properties/failure/anyOf", keyword: "anyOf", params: {} };
                                        if (vErrors === null) {
                                          vErrors = [err226];
                                        } else {
                                          vErrors.push(err226);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs346;
                                        if (vErrors !== null) {
                                          if (_errs346) {
                                            vErrors.length = _errs346;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid71 = _errs345 === errors;
                                    } else {
                                      var valid71 = true;
                                    }
                                    if (valid71) {
                                      if (data.id !== void 0) {
                                        const _errs360 = errors;
                                        if (typeof data.id !== "string") {
                                          const err227 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/15/properties/id/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err227];
                                          } else {
                                            vErrors.push(err227);
                                          }
                                          errors++;
                                        }
                                        var valid71 = _errs360 === errors;
                                      } else {
                                        var valid71 = true;
                                      }
                                      if (valid71) {
                                        if (data.result !== void 0) {
                                          const _errs362 = errors;
                                          if (typeof data.result !== "string") {
                                            const err228 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/15/properties/result/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err228];
                                            } else {
                                              vErrors.push(err228);
                                            }
                                            errors++;
                                          }
                                          var valid71 = _errs362 === errors;
                                        } else {
                                          var valid71 = true;
                                        }
                                        if (valid71) {
                                          if (data.revisedPrompt !== void 0) {
                                            let data128 = data.revisedPrompt;
                                            const _errs364 = errors;
                                            if (typeof data128 !== "string" && data128 !== null) {
                                              const err229 = { instancePath: instancePath + "/revisedPrompt", schemaPath: "#/oneOf/15/properties/revisedPrompt/type", keyword: "type", params: { type: schema50.oneOf[15].properties.revisedPrompt.type } };
                                              if (vErrors === null) {
                                                vErrors = [err229];
                                              } else {
                                                vErrors.push(err229);
                                              }
                                              errors++;
                                            }
                                            var valid71 = _errs364 === errors;
                                          } else {
                                            var valid71 = true;
                                          }
                                          if (valid71) {
                                            if (data.savedPath !== void 0) {
                                              let data129 = data.savedPath;
                                              const _errs366 = errors;
                                              const _errs367 = errors;
                                              let valid76 = false;
                                              const _errs368 = errors;
                                              if (typeof data129 !== "string") {
                                                const err230 = { instancePath: instancePath + "/savedPath", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err230];
                                                } else {
                                                  vErrors.push(err230);
                                                }
                                                errors++;
                                              }
                                              var _valid14 = _errs368 === errors;
                                              valid76 = valid76 || _valid14;
                                              if (!valid76) {
                                                const _errs371 = errors;
                                                if (data129 !== null) {
                                                  const err231 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/15/properties/savedPath/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err231];
                                                  } else {
                                                    vErrors.push(err231);
                                                  }
                                                  errors++;
                                                }
                                                var _valid14 = _errs371 === errors;
                                                valid76 = valid76 || _valid14;
                                              }
                                              if (!valid76) {
                                                const err232 = { instancePath: instancePath + "/savedPath", schemaPath: "#/oneOf/15/properties/savedPath/anyOf", keyword: "anyOf", params: {} };
                                                if (vErrors === null) {
                                                  vErrors = [err232];
                                                } else {
                                                  vErrors.push(err232);
                                                }
                                                errors++;
                                              } else {
                                                errors = _errs367;
                                                if (vErrors !== null) {
                                                  if (_errs367) {
                                                    vErrors.length = _errs367;
                                                  } else {
                                                    vErrors = null;
                                                  }
                                                }
                                              }
                                              var valid71 = _errs366 === errors;
                                            } else {
                                              var valid71 = true;
                                            }
                                            if (valid71) {
                                              if (data.status !== void 0) {
                                                const _errs373 = errors;
                                                if (typeof data.status !== "string") {
                                                  const err233 = { instancePath: instancePath + "/status", schemaPath: "#/oneOf/15/properties/status/type", keyword: "type", params: { type: "string" } };
                                                  if (vErrors === null) {
                                                    vErrors = [err233];
                                                  } else {
                                                    vErrors.push(err233);
                                                  }
                                                  errors++;
                                                }
                                                var valid71 = _errs373 === errors;
                                              } else {
                                                var valid71 = true;
                                              }
                                              if (valid71) {
                                                if (data.transparentBackground !== void 0) {
                                                  let data131 = data.transparentBackground;
                                                  const _errs375 = errors;
                                                  if (typeof data131 !== "boolean" && data131 !== null) {
                                                    const err234 = { instancePath: instancePath + "/transparentBackground", schemaPath: "#/oneOf/15/properties/transparentBackground/type", keyword: "type", params: { type: schema50.oneOf[15].properties.transparentBackground.type } };
                                                    if (vErrors === null) {
                                                      vErrors = [err234];
                                                    } else {
                                                      vErrors.push(err234);
                                                    }
                                                    errors++;
                                                  }
                                                  var valid71 = _errs375 === errors;
                                                } else {
                                                  var valid71 = true;
                                                }
                                                if (valid71) {
                                                  if (data.type !== void 0) {
                                                    let data132 = data.type;
                                                    const _errs377 = errors;
                                                    if (typeof data132 !== "string") {
                                                      const err235 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/type", keyword: "type", params: { type: "string" } };
                                                      if (vErrors === null) {
                                                        vErrors = [err235];
                                                      } else {
                                                        vErrors.push(err235);
                                                      }
                                                      errors++;
                                                    }
                                                    if (!(data132 === "imageGeneration")) {
                                                      const err236 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/15/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[15].properties.type.enum } };
                                                      if (vErrors === null) {
                                                        vErrors = [err236];
                                                      } else {
                                                        vErrors.push(err236);
                                                      }
                                                      errors++;
                                                    }
                                                    var valid71 = _errs377 === errors;
                                                  } else {
                                                    var valid71 = true;
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
                                  const err237 = { instancePath, schemaPath: "#/oneOf/15/type", keyword: "type", params: { type: "object" } };
                                  if (vErrors === null) {
                                    vErrors = [err237];
                                  } else {
                                    vErrors.push(err237);
                                  }
                                  errors++;
                                }
                              }
                              var _valid0 = _errs343 === errors;
                              if (_valid0 && valid0) {
                                valid0 = false;
                                passing0 = [passing0, 15];
                              } else {
                                if (_valid0) {
                                  valid0 = true;
                                  passing0 = 15;
                                }
                                const _errs379 = errors;
                                if (errors === _errs379) {
                                  if (data && typeof data == "object" && !Array.isArray(data)) {
                                    let missing28;
                                    if (data.id === void 0 && (missing28 = "id") || data.review === void 0 && (missing28 = "review") || data.type === void 0 && (missing28 = "type")) {
                                      const err238 = { instancePath, schemaPath: "#/oneOf/16/required", keyword: "required", params: { missingProperty: missing28 } };
                                      if (vErrors === null) {
                                        vErrors = [err238];
                                      } else {
                                        vErrors.push(err238);
                                      }
                                      errors++;
                                    } else {
                                      if (data.id !== void 0) {
                                        const _errs381 = errors;
                                        if (typeof data.id !== "string") {
                                          const err239 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/16/properties/id/type", keyword: "type", params: { type: "string" } };
                                          if (vErrors === null) {
                                            vErrors = [err239];
                                          } else {
                                            vErrors.push(err239);
                                          }
                                          errors++;
                                        }
                                        var valid78 = _errs381 === errors;
                                      } else {
                                        var valid78 = true;
                                      }
                                      if (valid78) {
                                        if (data.review !== void 0) {
                                          const _errs383 = errors;
                                          if (typeof data.review !== "string") {
                                            const err240 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/16/properties/review/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err240];
                                            } else {
                                              vErrors.push(err240);
                                            }
                                            errors++;
                                          }
                                          var valid78 = _errs383 === errors;
                                        } else {
                                          var valid78 = true;
                                        }
                                        if (valid78) {
                                          if (data.type !== void 0) {
                                            let data135 = data.type;
                                            const _errs385 = errors;
                                            if (typeof data135 !== "string") {
                                              const err241 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err241];
                                              } else {
                                                vErrors.push(err241);
                                              }
                                              errors++;
                                            }
                                            if (!(data135 === "enteredReviewMode")) {
                                              const err242 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/16/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[16].properties.type.enum } };
                                              if (vErrors === null) {
                                                vErrors = [err242];
                                              } else {
                                                vErrors.push(err242);
                                              }
                                              errors++;
                                            }
                                            var valid78 = _errs385 === errors;
                                          } else {
                                            var valid78 = true;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err243 = { instancePath, schemaPath: "#/oneOf/16/type", keyword: "type", params: { type: "object" } };
                                    if (vErrors === null) {
                                      vErrors = [err243];
                                    } else {
                                      vErrors.push(err243);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid0 = _errs379 === errors;
                                if (_valid0 && valid0) {
                                  valid0 = false;
                                  passing0 = [passing0, 16];
                                } else {
                                  if (_valid0) {
                                    valid0 = true;
                                    passing0 = 16;
                                  }
                                  const _errs387 = errors;
                                  if (errors === _errs387) {
                                    if (data && typeof data == "object" && !Array.isArray(data)) {
                                      let missing29;
                                      if (data.id === void 0 && (missing29 = "id") || data.review === void 0 && (missing29 = "review") || data.type === void 0 && (missing29 = "type")) {
                                        const err244 = { instancePath, schemaPath: "#/oneOf/17/required", keyword: "required", params: { missingProperty: missing29 } };
                                        if (vErrors === null) {
                                          vErrors = [err244];
                                        } else {
                                          vErrors.push(err244);
                                        }
                                        errors++;
                                      } else {
                                        if (data.id !== void 0) {
                                          const _errs389 = errors;
                                          if (typeof data.id !== "string") {
                                            const err245 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/17/properties/id/type", keyword: "type", params: { type: "string" } };
                                            if (vErrors === null) {
                                              vErrors = [err245];
                                            } else {
                                              vErrors.push(err245);
                                            }
                                            errors++;
                                          }
                                          var valid79 = _errs389 === errors;
                                        } else {
                                          var valid79 = true;
                                        }
                                        if (valid79) {
                                          if (data.review !== void 0) {
                                            const _errs391 = errors;
                                            if (typeof data.review !== "string") {
                                              const err246 = { instancePath: instancePath + "/review", schemaPath: "#/oneOf/17/properties/review/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err246];
                                              } else {
                                                vErrors.push(err246);
                                              }
                                              errors++;
                                            }
                                            var valid79 = _errs391 === errors;
                                          } else {
                                            var valid79 = true;
                                          }
                                          if (valid79) {
                                            if (data.type !== void 0) {
                                              let data138 = data.type;
                                              const _errs393 = errors;
                                              if (typeof data138 !== "string") {
                                                const err247 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err247];
                                                } else {
                                                  vErrors.push(err247);
                                                }
                                                errors++;
                                              }
                                              if (!(data138 === "exitedReviewMode")) {
                                                const err248 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/17/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[17].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err248];
                                                } else {
                                                  vErrors.push(err248);
                                                }
                                                errors++;
                                              }
                                              var valid79 = _errs393 === errors;
                                            } else {
                                              var valid79 = true;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err249 = { instancePath, schemaPath: "#/oneOf/17/type", keyword: "type", params: { type: "object" } };
                                      if (vErrors === null) {
                                        vErrors = [err249];
                                      } else {
                                        vErrors.push(err249);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid0 = _errs387 === errors;
                                  if (_valid0 && valid0) {
                                    valid0 = false;
                                    passing0 = [passing0, 17];
                                  } else {
                                    if (_valid0) {
                                      valid0 = true;
                                      passing0 = 17;
                                    }
                                    const _errs395 = errors;
                                    if (errors === _errs395) {
                                      if (data && typeof data == "object" && !Array.isArray(data)) {
                                        let missing30;
                                        if (data.id === void 0 && (missing30 = "id") || data.type === void 0 && (missing30 = "type")) {
                                          const err250 = { instancePath, schemaPath: "#/oneOf/18/required", keyword: "required", params: { missingProperty: missing30 } };
                                          if (vErrors === null) {
                                            vErrors = [err250];
                                          } else {
                                            vErrors.push(err250);
                                          }
                                          errors++;
                                        } else {
                                          if (data.id !== void 0) {
                                            const _errs397 = errors;
                                            if (typeof data.id !== "string") {
                                              const err251 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/18/properties/id/type", keyword: "type", params: { type: "string" } };
                                              if (vErrors === null) {
                                                vErrors = [err251];
                                              } else {
                                                vErrors.push(err251);
                                              }
                                              errors++;
                                            }
                                            var valid80 = _errs397 === errors;
                                          } else {
                                            var valid80 = true;
                                          }
                                          if (valid80) {
                                            if (data.type !== void 0) {
                                              let data140 = data.type;
                                              const _errs399 = errors;
                                              if (typeof data140 !== "string") {
                                                const err252 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/18/properties/type/type", keyword: "type", params: { type: "string" } };
                                                if (vErrors === null) {
                                                  vErrors = [err252];
                                                } else {
                                                  vErrors.push(err252);
                                                }
                                                errors++;
                                              }
                                              if (!(data140 === "contextCompaction")) {
                                                const err253 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/18/properties/type/enum", keyword: "enum", params: { allowedValues: schema50.oneOf[18].properties.type.enum } };
                                                if (vErrors === null) {
                                                  vErrors = [err253];
                                                } else {
                                                  vErrors.push(err253);
                                                }
                                                errors++;
                                              }
                                              var valid80 = _errs399 === errors;
                                            } else {
                                              var valid80 = true;
                                            }
                                          }
                                        }
                                      } else {
                                        const err254 = { instancePath, schemaPath: "#/oneOf/18/type", keyword: "type", params: { type: "object" } };
                                        if (vErrors === null) {
                                          vErrors = [err254];
                                        } else {
                                          vErrors.push(err254);
                                        }
                                        errors++;
                                      }
                                    }
                                    var _valid0 = _errs395 === errors;
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
    const err255 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 } };
    if (vErrors === null) {
      vErrors = [err255];
    } else {
      vErrors.push(err255);
    }
    errors++;
    validate44.errors = vErrors;
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
  validate44.errors = vErrors;
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
            validate37.errors = [{ instancePath: instancePath + "/completedAt", schemaPath: "#/properties/completedAt/type", keyword: "type", params: { type: schema44.properties.completedAt.type } }];
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
              validate37.errors = [{ instancePath: instancePath + "/durationMs", schemaPath: "#/properties/durationMs/type", keyword: "type", params: { type: schema44.properties.durationMs.type } }];
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
                        if (!validate44(data4[i0], { instancePath: instancePath + "/items/" + i0, parentData: data4, parentDataProperty: i0, rootData })) {
                          vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
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
                      const err3 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema88.oneOf[0].enum } };
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
                      const err5 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/1/enum", keyword: "enum", params: { allowedValues: schema88.oneOf[1].enum } };
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
                        const err7 = { instancePath: instancePath + "/itemsView", schemaPath: "#/definitions/v2/TurnItemsView/oneOf/2/enum", keyword: "enum", params: { allowedValues: schema88.oneOf[2].enum } };
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
                        validate37.errors = [{ instancePath: instancePath + "/startedAt", schemaPath: "#/properties/startedAt/type", keyword: "type", params: { type: schema44.properties.startedAt.type } }];
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
                          validate37.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/TurnStatus/enum", keyword: "enum", params: { allowedValues: schema89.enum } }];
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
      if (data.cliVersion === void 0 && (missing0 = "cliVersion") || data.createdAt === void 0 && (missing0 = "createdAt") || data.cwd === void 0 && (missing0 = "cwd") || data.ephemeral === void 0 && (missing0 = "ephemeral") || data.id === void 0 && (missing0 = "id") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.preview === void 0 && (missing0 = "preview") || data.projectId === void 0 && (missing0 = "projectId") || data.sessionId === void 0 && (missing0 = "sessionId") || data.source === void 0 && (missing0 = "source") || data.status === void 0 && (missing0 = "status") || data.turns === void 0 && (missing0 = "turns") || data.updatedAt === void 0 && (missing0 = "updatedAt")) {
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
                        if (data.historyMode !== void 0) {
                          let data11 = data.historyMode;
                          const _errs30 = errors;
                          if (typeof data11 !== "string") {
                            validate28.errors = [{ instancePath: instancePath + "/historyMode", schemaPath: "#/definitions/v2/ThreadHistoryMode/type", keyword: "type", params: { type: "string" } }];
                            return false;
                          }
                          if (!(data11 === "legacy" || data11 === "paginated")) {
                            validate28.errors = [{ instancePath: instancePath + "/historyMode", schemaPath: "#/definitions/v2/ThreadHistoryMode/enum", keyword: "enum", params: { allowedValues: schema34.enum } }];
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
                              validate28.errors = [{ instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" } }];
                              return false;
                            }
                            var valid0 = _errs34 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.modelProvider !== void 0) {
                              const _errs36 = errors;
                              if (typeof data.modelProvider !== "string") {
                                validate28.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                                return false;
                              }
                              var valid0 = _errs36 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.name !== void 0) {
                                let data14 = data.name;
                                const _errs38 = errors;
                                if (typeof data14 !== "string" && data14 !== null) {
                                  validate28.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: schema31.properties.name.type } }];
                                  return false;
                                }
                                var valid0 = _errs38 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.parentThreadId !== void 0) {
                                  let data15 = data.parentThreadId;
                                  const _errs40 = errors;
                                  if (typeof data15 !== "string" && data15 !== null) {
                                    validate28.errors = [{ instancePath: instancePath + "/parentThreadId", schemaPath: "#/properties/parentThreadId/type", keyword: "type", params: { type: schema31.properties.parentThreadId.type } }];
                                    return false;
                                  }
                                  var valid0 = _errs40 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.path !== void 0) {
                                    let data16 = data.path;
                                    const _errs42 = errors;
                                    if (typeof data16 !== "string" && data16 !== null) {
                                      validate28.errors = [{ instancePath: instancePath + "/path", schemaPath: "#/properties/path/type", keyword: "type", params: { type: schema31.properties.path.type } }];
                                      return false;
                                    }
                                    var valid0 = _errs42 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.preview !== void 0) {
                                      const _errs44 = errors;
                                      if (typeof data.preview !== "string") {
                                        validate28.errors = [{ instancePath: instancePath + "/preview", schemaPath: "#/properties/preview/type", keyword: "type", params: { type: "string" } }];
                                        return false;
                                      }
                                      var valid0 = _errs44 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.projectId !== void 0) {
                                        let data18 = data.projectId;
                                        const _errs46 = errors;
                                        if (typeof data18 !== "string" && data18 !== null) {
                                          validate28.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/properties/projectId/type", keyword: "type", params: { type: schema31.properties.projectId.type } }];
                                          return false;
                                        }
                                        var valid0 = _errs46 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.recencyAt !== void 0) {
                                          let data19 = data.recencyAt;
                                          const _errs48 = errors;
                                          if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19)) && data19 !== null) {
                                            validate28.errors = [{ instancePath: instancePath + "/recencyAt", schemaPath: "#/properties/recencyAt/type", keyword: "type", params: { type: schema31.properties.recencyAt.type } }];
                                            return false;
                                          }
                                          var valid0 = _errs48 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.section !== void 0) {
                                            let data20 = data.section;
                                            const _errs50 = errors;
                                            const _errs51 = errors;
                                            let valid8 = false;
                                            const _errs52 = errors;
                                            if (!validate29(data20, { instancePath: instancePath + "/section", parentData: data, parentDataProperty: "section", rootData })) {
                                              vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
                                              errors = vErrors.length;
                                            }
                                            var _valid1 = _errs52 === errors;
                                            valid8 = valid8 || _valid1;
                                            if (!valid8) {
                                              const _errs53 = errors;
                                              if (data20 !== null) {
                                                const err6 = { instancePath: instancePath + "/section", schemaPath: "#/properties/section/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                if (vErrors === null) {
                                                  vErrors = [err6];
                                                } else {
                                                  vErrors.push(err6);
                                                }
                                                errors++;
                                              }
                                              var _valid1 = _errs53 === errors;
                                              valid8 = valid8 || _valid1;
                                            }
                                            if (!valid8) {
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
                                              errors = _errs51;
                                              if (vErrors !== null) {
                                                if (_errs51) {
                                                  vErrors.length = _errs51;
                                                } else {
                                                  vErrors = null;
                                                }
                                              }
                                            }
                                            var valid0 = _errs50 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                          if (valid0) {
                                            if (data.sectionEnteredAt !== void 0) {
                                              let data21 = data.sectionEnteredAt;
                                              const _errs55 = errors;
                                              if (!(typeof data21 == "number" && (!(data21 % 1) && !isNaN(data21)) && isFinite(data21)) && data21 !== null) {
                                                validate28.errors = [{ instancePath: instancePath + "/sectionEnteredAt", schemaPath: "#/properties/sectionEnteredAt/type", keyword: "type", params: { type: schema31.properties.sectionEnteredAt.type } }];
                                                return false;
                                              }
                                              var valid0 = _errs55 === errors;
                                            } else {
                                              var valid0 = true;
                                            }
                                            if (valid0) {
                                              if (data.sessionId !== void 0) {
                                                const _errs57 = errors;
                                                if (typeof data.sessionId !== "string") {
                                                  validate28.errors = [{ instancePath: instancePath + "/sessionId", schemaPath: "#/properties/sessionId/type", keyword: "type", params: { type: "string" } }];
                                                  return false;
                                                }
                                                var valid0 = _errs57 === errors;
                                              } else {
                                                var valid0 = true;
                                              }
                                              if (valid0) {
                                                if (data.source !== void 0) {
                                                  const _errs59 = errors;
                                                  if (!validate31(data.source, { instancePath: instancePath + "/source", parentData: data, parentDataProperty: "source", rootData })) {
                                                    vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var valid0 = _errs59 === errors;
                                                } else {
                                                  var valid0 = true;
                                                }
                                                if (valid0) {
                                                  if (data.status !== void 0) {
                                                    const _errs61 = errors;
                                                    if (!validate35(data.status, { instancePath: instancePath + "/status", parentData: data, parentDataProperty: "status", rootData })) {
                                                      vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
                                                      errors = vErrors.length;
                                                    }
                                                    var valid0 = _errs61 === errors;
                                                  } else {
                                                    var valid0 = true;
                                                  }
                                                  if (valid0) {
                                                    if (data.threadSource !== void 0) {
                                                      let data25 = data.threadSource;
                                                      const _errs63 = errors;
                                                      const _errs64 = errors;
                                                      let valid11 = false;
                                                      const _errs65 = errors;
                                                      if (typeof data25 !== "string") {
                                                        const err8 = { instancePath: instancePath + "/threadSource", schemaPath: "#/definitions/v2/ThreadSource/type", keyword: "type", params: { type: "string" } };
                                                        if (vErrors === null) {
                                                          vErrors = [err8];
                                                        } else {
                                                          vErrors.push(err8);
                                                        }
                                                        errors++;
                                                      }
                                                      var _valid2 = _errs65 === errors;
                                                      valid11 = valid11 || _valid2;
                                                      if (!valid11) {
                                                        const _errs68 = errors;
                                                        if (data25 !== null) {
                                                          const err9 = { instancePath: instancePath + "/threadSource", schemaPath: "#/properties/threadSource/anyOf/1/type", keyword: "type", params: { type: "null" } };
                                                          if (vErrors === null) {
                                                            vErrors = [err9];
                                                          } else {
                                                            vErrors.push(err9);
                                                          }
                                                          errors++;
                                                        }
                                                        var _valid2 = _errs68 === errors;
                                                        valid11 = valid11 || _valid2;
                                                      }
                                                      if (!valid11) {
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
                                                        errors = _errs64;
                                                        if (vErrors !== null) {
                                                          if (_errs64) {
                                                            vErrors.length = _errs64;
                                                          } else {
                                                            vErrors = null;
                                                          }
                                                        }
                                                      }
                                                      var valid0 = _errs63 === errors;
                                                    } else {
                                                      var valid0 = true;
                                                    }
                                                    if (valid0) {
                                                      if (data.turns !== void 0) {
                                                        let data26 = data.turns;
                                                        const _errs70 = errors;
                                                        if (errors === _errs70) {
                                                          if (Array.isArray(data26)) {
                                                            var valid13 = true;
                                                            const len0 = data26.length;
                                                            for (let i0 = 0; i0 < len0; i0++) {
                                                              const _errs72 = errors;
                                                              if (!validate37(data26[i0], { instancePath: instancePath + "/turns/" + i0, parentData: data26, parentDataProperty: i0, rootData })) {
                                                                vErrors = vErrors === null ? validate37.errors : vErrors.concat(validate37.errors);
                                                                errors = vErrors.length;
                                                              }
                                                              var valid13 = _errs72 === errors;
                                                              if (!valid13) {
                                                                break;
                                                              }
                                                            }
                                                          } else {
                                                            validate28.errors = [{ instancePath: instancePath + "/turns", schemaPath: "#/properties/turns/type", keyword: "type", params: { type: "array" } }];
                                                            return false;
                                                          }
                                                        }
                                                        var valid0 = _errs70 === errors;
                                                      } else {
                                                        var valid0 = true;
                                                      }
                                                      if (valid0) {
                                                        if (data.updatedAt !== void 0) {
                                                          let data28 = data.updatedAt;
                                                          const _errs73 = errors;
                                                          if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
                                                            validate28.errors = [{ instancePath: instancePath + "/updatedAt", schemaPath: "#/properties/updatedAt/type", keyword: "type", params: { type: "integer" } }];
                                                            return false;
                                                          }
                                                          var valid0 = _errs73 === errors;
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
      if (data.backwardsCursor === void 0 && (missing0 = "backwardsCursor") || data.data === void 0 && (missing0 = "data") || data.nextCursor === void 0 && (missing0 = "nextCursor")) {
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
var validateV2ThreadProjectionAttachResponse = validate65;
var schema92 = { "properties": { "headCommitId": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" }, "tokenUsage": { "anyOf": [{ "$ref": "#/definitions/v2/ThreadTokenUsage" }, { "type": "null" }] } }, "required": ["thread"], "type": "object" };
var schema93 = { "properties": { "last": { "$ref": "#/definitions/v2/TokenUsageBreakdown" }, "modelContextWindow": { "format": "int64", "type": ["integer", "null"] }, "total": { "$ref": "#/definitions/v2/TokenUsageBreakdown" } }, "required": ["last", "total"], "type": "object" };
function validate69(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.last === void 0 && (missing0 = "last") || data.total === void 0 && (missing0 = "total")) {
        validate69.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
                validate69.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.cacheWriteInputTokens !== void 0) {
                  let data1 = data0.cacheWriteInputTokens;
                  const _errs4 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate69.errors = [{ instancePath: instancePath + "/last/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                      validate69.errors = [{ instancePath: instancePath + "/last/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                        validate69.errors = [{ instancePath: instancePath + "/last/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                          validate69.errors = [{ instancePath: instancePath + "/last/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                            validate69.errors = [{ instancePath: instancePath + "/last/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                              validate69.errors = [{ instancePath: instancePath + "/last/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
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
              validate69.errors = [{ instancePath: instancePath + "/last", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
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
              validate69.errors = [{ instancePath: instancePath + "/modelContextWindow", schemaPath: "#/properties/modelContextWindow/type", keyword: "type", params: { type: schema93.properties.modelContextWindow.type } }];
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
                    validate69.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/required", keyword: "required", params: { missingProperty: missing2 } }];
                    return false;
                  } else {
                    if (data8.cacheWriteInputTokens !== void 0) {
                      let data9 = data8.cacheWriteInputTokens;
                      const _errs21 = errors;
                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                        validate69.errors = [{ instancePath: instancePath + "/total/cacheWriteInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cacheWriteInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                          validate69.errors = [{ instancePath: instancePath + "/total/cachedInputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/cachedInputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                            validate69.errors = [{ instancePath: instancePath + "/total/inputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/inputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                              validate69.errors = [{ instancePath: instancePath + "/total/outputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/outputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                                validate69.errors = [{ instancePath: instancePath + "/total/reasoningOutputTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/reasoningOutputTokens/type", keyword: "type", params: { type: "integer" } }];
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
                                  validate69.errors = [{ instancePath: instancePath + "/total/totalTokens", schemaPath: "#/definitions/v2/TokenUsageBreakdown/properties/totalTokens/type", keyword: "type", params: { type: "integer" } }];
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
                  validate69.errors = [{ instancePath: instancePath + "/total", schemaPath: "#/definitions/v2/TokenUsageBreakdown/type", keyword: "type", params: { type: "object" } }];
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
      validate69.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate69.errors = vErrors;
  return errors === 0;
}
function validate67(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate67.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.headCommitId !== void 0) {
          let data0 = data.headCommitId;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate67.errors = [{ instancePath: instancePath + "/headCommitId", schemaPath: "#/properties/headCommitId/type", keyword: "type", params: { type: schema92.properties.headCommitId.type } }];
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
              if (!validate69(data2, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
                vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
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
                validate67.errors = vErrors;
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
      validate67.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate67.errors = vErrors;
  return errors === 0;
}
function validate66(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.snapshot === void 0 && (missing0 = "snapshot") || data.subscriptionId === void 0 && (missing0 = "subscriptionId")) {
        validate66.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.snapshot !== void 0) {
          const _errs1 = errors;
          if (!validate67(data.snapshot, { instancePath: instancePath + "/snapshot", parentData: data, parentDataProperty: "snapshot", rootData })) {
            vErrors = vErrors === null ? validate67.errors : vErrors.concat(validate67.errors);
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
              validate66.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate66.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate66.errors = vErrors;
  return errors === 0;
}
function validate65(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate66(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate66.errors : vErrors.concat(validate66.errors);
    errors = vErrors.length;
  }
  validate65.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionClosedNotification = validate73;
var schema98 = { "enum": ["backpressure"], "type": "string" };
function validate74(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.reason === void 0 && (missing0 = "reason") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate74.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.reason !== void 0) {
          let data0 = data.reason;
          const _errs1 = errors;
          if (typeof data0 !== "string") {
            validate74.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "backpressure")) {
            validate74.errors = [{ instancePath: instancePath + "/reason", schemaPath: "#/definitions/v2/ThreadProjectionClosedReason/enum", keyword: "enum", params: { allowedValues: schema98.enum } }];
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
              validate74.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                validate74.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate74.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate74.errors = vErrors;
  return errors === 0;
}
function validate73(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate74(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate74.errors : vErrors.concat(validate74.errors);
    errors = vErrors.length;
  }
  validate73.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDeltaNotification = validate76;
var schema101 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/AgentMessageDeltaNotification" }, "type": { "enum": ["agentMessage"], "title": "AgentMessageThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "AgentMessageThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryTextDeltaNotification" }, "type": { "enum": ["reasoningSummaryText"], "title": "ReasoningSummaryTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryTextThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningSummaryPartAddedNotification" }, "type": { "enum": ["reasoningSummaryPartAdded"], "title": "ReasoningSummaryPartAddedThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningSummaryPartAddedThreadProjectionDelta", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ReasoningTextDeltaNotification" }, "type": { "enum": ["reasoningText"], "title": "ReasoningTextThreadProjectionDeltaType", "type": "string" } }, "required": ["notification", "type"], "title": "ReasoningTextThreadProjectionDelta", "type": "object" }] };
function validate78(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
              const err8 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema101.oneOf[0].properties.type.enum } };
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
              const err19 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema101.oneOf[1].properties.type.enum } };
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
                const err29 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema101.oneOf[2].properties.type.enum } };
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
                  const err40 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema101.oneOf[3].properties.type.enum } };
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
    validate78.errors = vErrors;
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
  validate78.errors = vErrors;
  return errors === 0;
}
function validate77(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.delta === void 0 && (missing0 = "delta") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate77.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.delta !== void 0) {
          const _errs1 = errors;
          if (!validate78(data.delta, { instancePath: instancePath + "/delta", parentData: data, parentDataProperty: "delta", rootData })) {
            vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
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
              validate77.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                validate77.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate77.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate77.errors = vErrors;
  return errors === 0;
}
function validate76(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate77(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
    errors = vErrors.length;
  }
  validate76.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionDetachResponse = validate81;
var schema108 = { "enum": ["detached", "notSubscribed", "notLoaded"], "type": "string" };
function validate82(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.status === void 0 && (missing0 = "status")) {
        validate82.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.status !== void 0) {
          let data0 = data.status;
          if (typeof data0 !== "string") {
            validate82.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          if (!(data0 === "detached" || data0 === "notSubscribed" || data0 === "notLoaded")) {
            validate82.errors = [{ instancePath: instancePath + "/status", schemaPath: "#/definitions/v2/ThreadProjectionDetachStatus/enum", keyword: "enum", params: { allowedValues: schema108.enum } }];
            return false;
          }
        }
      }
    } else {
      validate82.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate82.errors = vErrors;
  return errors === 0;
}
function validate81(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate82(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate82.errors : vErrors.concat(validate82.errors);
    errors = vErrors.length;
  }
  validate81.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadProjectionEventNotification = validate84;
var schema110 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "commitId": { "type": "string" }, "event": { "$ref": "#/definitions/v2/ThreadProjectionEvent" }, "parentCommitId": { "type": ["string", "null"] }, "subscriptionId": { "type": "string" }, "threadId": { "type": "string" } }, "required": ["commitId", "event", "subscriptionId", "threadId"], "title": "ThreadProjectionEventNotification", "type": "object" };
var schema111 = { "oneOf": [{ "properties": { "notification": { "$ref": "#/definitions/v2/TurnStartedNotification" }, "type": { "enum": ["turnStarted"], "title": "TurnStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/TurnCompletedNotification" }, "type": { "enum": ["turnCompleted"], "title": "TurnCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TurnCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemStartedNotification" }, "type": { "enum": ["itemStarted"], "title": "ItemStartedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemStartedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ItemCompletedNotification" }, "type": { "enum": ["itemCompleted"], "title": "ItemCompletedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "ItemCompletedThreadProjectionEvent", "type": "object" }, { "properties": { "notification": { "$ref": "#/definitions/v2/ThreadTokenUsageUpdatedNotification" }, "type": { "enum": ["tokenUsageUpdated"], "title": "TokenUsageUpdatedThreadProjectionEventType", "type": "string" } }, "required": ["notification", "type"], "title": "TokenUsageUpdatedThreadProjectionEvent", "type": "object" }] };
function validate87(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate87.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate87.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      if (data.threadId === void 0 && (missing0 = "threadId") || data.turn === void 0 && (missing0 = "turn")) {
        validate90.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.threadId !== void 0) {
          const _errs1 = errors;
          if (typeof data.threadId !== "string") {
            validate90.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      if (data.item === void 0 && (missing0 = "item") || data.startedAtMs === void 0 && (missing0 = "startedAtMs") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate93.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.item !== void 0) {
          const _errs1 = errors;
          if (!validate44(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
            vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
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
              validate93.errors = [{ instancePath: instancePath + "/startedAtMs", schemaPath: "#/properties/startedAtMs/type", keyword: "type", params: { type: "integer" } }];
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
                validate93.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
                  validate93.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate93.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate93.errors = vErrors;
  return errors === 0;
}
function validate96(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.completedAtMs === void 0 && (missing0 = "completedAtMs") || data.item === void 0 && (missing0 = "item") || data.threadId === void 0 && (missing0 = "threadId") || data.turnId === void 0 && (missing0 = "turnId")) {
        validate96.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.completedAtMs !== void 0) {
          let data0 = data.completedAtMs;
          const _errs1 = errors;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            validate96.errors = [{ instancePath: instancePath + "/completedAtMs", schemaPath: "#/properties/completedAtMs/type", keyword: "type", params: { type: "integer" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.item !== void 0) {
            const _errs3 = errors;
            if (!validate44(data.item, { instancePath: instancePath + "/item", parentData: data, parentDataProperty: "item", rootData })) {
              vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
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
                validate96.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
                  validate96.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate96.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate96.errors = vErrors;
  return errors === 0;
}
function validate99(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.threadId === void 0 && (missing0 = "threadId") || data.tokenUsage === void 0 && (missing0 = "tokenUsage") || data.turnId === void 0 && (missing0 = "turnId")) {
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
          if (data.tokenUsage !== void 0) {
            const _errs3 = errors;
            if (!validate69(data.tokenUsage, { instancePath: instancePath + "/tokenUsage", parentData: data, parentDataProperty: "tokenUsage", rootData })) {
              vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
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
                validate99.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "#/properties/turnId/type", keyword: "type", params: { type: "string" } }];
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
      validate99.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate99.errors = vErrors;
  return errors === 0;
}
function validate86(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!validate87(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
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
              const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema111.oneOf[0].properties.type.enum } };
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
          if (!validate90(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
            vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
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
              const err6 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema111.oneOf[1].properties.type.enum } };
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
            if (!validate93(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
              vErrors = vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
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
                const err10 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema111.oneOf[2].properties.type.enum } };
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
              if (!validate96(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                vErrors = vErrors === null ? validate96.errors : vErrors.concat(validate96.errors);
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
                  const err14 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema111.oneOf[3].properties.type.enum } };
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
                if (!validate99(data.notification, { instancePath: instancePath + "/notification", parentData: data, parentDataProperty: "notification", rootData })) {
                  vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
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
                    const err18 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/enum", keyword: "enum", params: { allowedValues: schema111.oneOf[4].properties.type.enum } };
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
    validate86.errors = vErrors;
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
  validate86.errors = vErrors;
  return errors === 0;
}
function validate85(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.commitId === void 0 && (missing0 = "commitId") || data.event === void 0 && (missing0 = "event") || data.subscriptionId === void 0 && (missing0 = "subscriptionId") || data.threadId === void 0 && (missing0 = "threadId")) {
        validate85.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.commitId !== void 0) {
          const _errs1 = errors;
          if (typeof data.commitId !== "string") {
            validate85.errors = [{ instancePath: instancePath + "/commitId", schemaPath: "#/properties/commitId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.event !== void 0) {
            const _errs3 = errors;
            if (!validate86(data.event, { instancePath: instancePath + "/event", parentData: data, parentDataProperty: "event", rootData })) {
              vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
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
                validate85.errors = [{ instancePath: instancePath + "/parentCommitId", schemaPath: "#/properties/parentCommitId/type", keyword: "type", params: { type: schema110.properties.parentCommitId.type } }];
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
                  validate85.errors = [{ instancePath: instancePath + "/subscriptionId", schemaPath: "#/properties/subscriptionId/type", keyword: "type", params: { type: "string" } }];
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
                    validate85.errors = [{ instancePath: instancePath + "/threadId", schemaPath: "#/properties/threadId/type", keyword: "type", params: { type: "string" } }];
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
      validate85.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate85.errors = vErrors;
  return errors === 0;
}
function validate84(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate85(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate85.errors : vErrors.concat(validate85.errors);
    errors = vErrors.length;
  }
  validate84.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadReadResponse = validate104;
function validate105(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.thread === void 0 && (missing0 = "thread")) {
        validate105.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
      validate105.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate105.errors = vErrors;
  return errors === 0;
}
function validate104(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate105(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate105.errors : vErrors.concat(validate105.errors);
    errors = vErrors.length;
  }
  validate104.errors = vErrors;
  return errors === 0;
}
var validateV2ThreadResumeResponse = validate108;
var schema120 = { "$schema": "http://json-schema.org/draft-07/schema#", "properties": { "approvalPolicy": { "$ref": "#/definitions/v2/AskForApproval" }, "approvalsReviewer": { "allOf": [{ "$ref": "#/definitions/v2/ApprovalsReviewer" }], "description": "Reviewer currently used for approval requests on this thread." }, "cwd": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "instructionSources": { "default": [], "description": "Environment-native paths to instruction source files currently loaded for this thread.", "items": { "$ref": "#/definitions/v2/LegacyAppPathString" }, "type": "array" }, "itemsBackwardsCursor": { "description": 'Opaque cursor for hydrating paginated items backwards.\n\nPass this as `cursor` to `thread/items/list` with `sortDirection: "desc"`. The first page includes the item identified by the cursor.', "type": ["string", "null"] }, "model": { "type": "string" }, "modelProvider": { "type": "string" }, "reasoningEffort": { "anyOf": [{ "$ref": "#/definitions/v2/ReasoningEffort" }, { "type": "null" }] }, "sandbox": { "allOf": [{ "$ref": "#/definitions/v2/SandboxPolicy" }], "description": "Legacy sandbox policy retained for compatibility. Experimental clients should prefer `activePermissionProfile` for profile provenance." }, "serviceTier": { "type": ["string", "null"] }, "thread": { "$ref": "#/definitions/v2/Thread" }, "turnsBackwardsCursor": { "description": 'Opaque cursor for hydrating paginated turns backwards.\n\nPass this as `cursor` to `thread/turns/list` with `sortDirection: "desc"`. The first page includes the turn identified by the cursor.', "type": ["string", "null"] } }, "required": ["approvalPolicy", "approvalsReviewer", "cwd", "itemsBackwardsCursor", "model", "modelProvider", "reasoningEffort", "sandbox", "serviceTier", "thread", "turnsBackwardsCursor"], "title": "ThreadResumeResponse", "type": "object" };
var schema121 = { "oneOf": [{ "enum": ["untrusted", "on-request", "never"], "type": "string" }, { "additionalProperties": false, "properties": { "granular": { "properties": { "mcp_elicitations": { "type": "boolean" }, "request_permissions": { "default": false, "type": "boolean" }, "rules": { "type": "boolean" }, "sandbox_approval": { "type": "boolean" }, "skill_approval": { "default": false, "type": "boolean" } }, "required": ["mcp_elicitations", "rules", "sandbox_approval"], "type": "object" } }, "required": ["granular"], "title": "GranularAskForApproval", "type": "object" }] };
var schema122 = { "description": "Configures who approval requests are routed to for review. Examples include sandbox escapes, blocked network access, MCP approval prompts, and ARC escalations. Defaults to `user`. `auto_review` uses a carefully prompted subagent to gather relevant context and apply a risk-based decision framework before approving or denying the request. The legacy value `guardian_subagent` is accepted for compatibility.", "enum": ["user", "auto_review", "guardian_subagent"], "type": "string" };
var schema126 = { "oneOf": [{ "properties": { "type": { "enum": ["dangerFullAccess"], "title": "DangerFullAccessSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "DangerFullAccessSandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["readOnly"], "title": "ReadOnlySandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ReadOnlySandboxPolicy", "type": "object" }, { "properties": { "networkAccess": { "allOf": [{ "$ref": "#/definitions/v2/NetworkAccess" }], "default": "restricted" }, "type": { "enum": ["externalSandbox"], "title": "ExternalSandboxSandboxPolicyType", "type": "string" } }, "required": ["type"], "title": "ExternalSandboxSandboxPolicy", "type": "object" }, { "properties": { "excludeSlashTmp": { "default": false, "type": "boolean" }, "excludeTmpdirEnvVar": { "default": false, "type": "boolean" }, "networkAccess": { "default": false, "type": "boolean" }, "type": { "enum": ["workspaceWrite"], "title": "WorkspaceWriteSandboxPolicyType", "type": "string" }, "writableRoots": { "default": [], "items": { "$ref": "#/definitions/v2/AbsolutePathBuf" }, "type": "array" } }, "required": ["type"], "title": "WorkspaceWriteSandboxPolicy", "type": "object" }] };
var schema127 = { "enum": ["restricted", "enabled"], "type": "string" };
function validate110(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err2 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/enum", keyword: "enum", params: { allowedValues: schema126.oneOf[0].properties.type.enum } };
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
              const err7 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/enum", keyword: "enum", params: { allowedValues: schema126.oneOf[1].properties.type.enum } };
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
              const err11 = { instancePath: instancePath + "/networkAccess", schemaPath: "#/definitions/v2/NetworkAccess/enum", keyword: "enum", params: { allowedValues: schema127.enum } };
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
                const err13 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/enum", keyword: "enum", params: { allowedValues: schema126.oneOf[2].properties.type.enum } };
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
                      const err20 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/enum", keyword: "enum", params: { allowedValues: schema126.oneOf[3].properties.type.enum } };
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
    validate110.errors = vErrors;
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
  validate110.errors = vErrors;
  return errors === 0;
}
function validate109(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.approvalPolicy === void 0 && (missing0 = "approvalPolicy") || data.approvalsReviewer === void 0 && (missing0 = "approvalsReviewer") || data.cwd === void 0 && (missing0 = "cwd") || data.itemsBackwardsCursor === void 0 && (missing0 = "itemsBackwardsCursor") || data.model === void 0 && (missing0 = "model") || data.modelProvider === void 0 && (missing0 = "modelProvider") || data.reasoningEffort === void 0 && (missing0 = "reasoningEffort") || data.sandbox === void 0 && (missing0 = "sandbox") || data.serviceTier === void 0 && (missing0 = "serviceTier") || data.thread === void 0 && (missing0 = "thread") || data.turnsBackwardsCursor === void 0 && (missing0 = "turnsBackwardsCursor")) {
        validate109.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
            const err1 = { instancePath: instancePath + "/approvalPolicy", schemaPath: "#/definitions/v2/AskForApproval/oneOf/0/enum", keyword: "enum", params: { allowedValues: schema121.oneOf[0].enum } };
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
            validate109.errors = vErrors;
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
              validate109.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            if (!(data7 === "user" || data7 === "auto_review" || data7 === "guardian_subagent")) {
              validate109.errors = [{ instancePath: instancePath + "/approvalsReviewer", schemaPath: "#/definitions/v2/ApprovalsReviewer/enum", keyword: "enum", params: { allowedValues: schema122.enum } }];
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
                validate109.errors = [{ instancePath: instancePath + "/cwd", schemaPath: "#/definitions/v2/AbsolutePathBuf/type", keyword: "type", params: { type: "string" } }];
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
                        validate109.errors = [{ instancePath: instancePath + "/instructionSources/" + i0, schemaPath: "#/definitions/v2/LegacyAppPathString/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid8 = _errs30 === errors;
                      if (!valid8) {
                        break;
                      }
                    }
                  } else {
                    validate109.errors = [{ instancePath: instancePath + "/instructionSources", schemaPath: "#/properties/instructionSources/type", keyword: "type", params: { type: "array" } }];
                    return false;
                  }
                }
                var valid0 = _errs28 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.itemsBackwardsCursor !== void 0) {
                  let data11 = data.itemsBackwardsCursor;
                  const _errs33 = errors;
                  if (typeof data11 !== "string" && data11 !== null) {
                    validate109.errors = [{ instancePath: instancePath + "/itemsBackwardsCursor", schemaPath: "#/properties/itemsBackwardsCursor/type", keyword: "type", params: { type: schema120.properties.itemsBackwardsCursor.type } }];
                    return false;
                  }
                  var valid0 = _errs33 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.model !== void 0) {
                    const _errs35 = errors;
                    if (typeof data.model !== "string") {
                      validate109.errors = [{ instancePath: instancePath + "/model", schemaPath: "#/properties/model/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid0 = _errs35 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.modelProvider !== void 0) {
                      const _errs37 = errors;
                      if (typeof data.modelProvider !== "string") {
                        validate109.errors = [{ instancePath: instancePath + "/modelProvider", schemaPath: "#/properties/modelProvider/type", keyword: "type", params: { type: "string" } }];
                        return false;
                      }
                      var valid0 = _errs37 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.reasoningEffort !== void 0) {
                        let data14 = data.reasoningEffort;
                        const _errs39 = errors;
                        const _errs40 = errors;
                        let valid10 = false;
                        const _errs41 = errors;
                        const _errs42 = errors;
                        if (errors === _errs42) {
                          if (typeof data14 === "string") {
                            if (func2(data14) < 1) {
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
                        var _valid1 = _errs41 === errors;
                        valid10 = valid10 || _valid1;
                        if (!valid10) {
                          const _errs44 = errors;
                          if (data14 !== null) {
                            const err15 = { instancePath: instancePath + "/reasoningEffort", schemaPath: "#/properties/reasoningEffort/anyOf/1/type", keyword: "type", params: { type: "null" } };
                            if (vErrors === null) {
                              vErrors = [err15];
                            } else {
                              vErrors.push(err15);
                            }
                            errors++;
                          }
                          var _valid1 = _errs44 === errors;
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
                          validate109.errors = vErrors;
                          return false;
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
                        var valid0 = _errs39 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.sandbox !== void 0) {
                          const _errs46 = errors;
                          if (!validate110(data.sandbox, { instancePath: instancePath + "/sandbox", parentData: data, parentDataProperty: "sandbox", rootData })) {
                            vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs46 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.serviceTier !== void 0) {
                            let data16 = data.serviceTier;
                            const _errs48 = errors;
                            if (typeof data16 !== "string" && data16 !== null) {
                              validate109.errors = [{ instancePath: instancePath + "/serviceTier", schemaPath: "#/properties/serviceTier/type", keyword: "type", params: { type: schema120.properties.serviceTier.type } }];
                              return false;
                            }
                            var valid0 = _errs48 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.thread !== void 0) {
                              const _errs50 = errors;
                              if (!validate28(data.thread, { instancePath: instancePath + "/thread", parentData: data, parentDataProperty: "thread", rootData })) {
                                vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs50 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.turnsBackwardsCursor !== void 0) {
                                let data18 = data.turnsBackwardsCursor;
                                const _errs51 = errors;
                                if (typeof data18 !== "string" && data18 !== null) {
                                  validate109.errors = [{ instancePath: instancePath + "/turnsBackwardsCursor", schemaPath: "#/properties/turnsBackwardsCursor/type", keyword: "type", params: { type: schema120.properties.turnsBackwardsCursor.type } }];
                                  return false;
                                }
                                var valid0 = _errs51 === errors;
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
    } else {
      validate109.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate109.errors = vErrors;
  return errors === 0;
}
function validate108(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate109(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate109.errors : vErrors.concat(validate109.errors);
    errors = vErrors.length;
  }
  validate108.errors = vErrors;
  return errors === 0;
}
var validateV2TurnError = validate114;
function validate115(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.message === void 0 && (missing0 = "message")) {
        validate115.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.additionalDetails !== void 0) {
          let data0 = data.additionalDetails;
          const _errs1 = errors;
          if (typeof data0 !== "string" && data0 !== null) {
            validate115.errors = [{ instancePath: instancePath + "/additionalDetails", schemaPath: "#/properties/additionalDetails/type", keyword: "type", params: { type: schema45.properties.additionalDetails.type } }];
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
              validate115.errors = vErrors;
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
                validate115.errors = [{ instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" } }];
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
                if (!validate41(data3, { instancePath: instancePath + "/misalignment", parentData: data, parentDataProperty: "misalignment", rootData })) {
                  vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
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
                  validate115.errors = vErrors;
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
      validate115.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate115.errors = vErrors;
  return errors === 0;
}
function validate114(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate115(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
    errors = vErrors.length;
  }
  validate114.errors = vErrors;
  return errors === 0;
}
var validateV2TurnInterruptResponse = validate119;
function validate119(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!(data && typeof data == "object" && !Array.isArray(data))) {
    validate119.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnInterruptResponse/type", keyword: "type", params: { type: "object" } }];
    return false;
  }
  validate119.errors = vErrors;
  return errors === 0;
}
var validateV2TurnStartResponse = validate120;
function validate121(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turn === void 0 && (missing0 = "turn")) {
        validate121.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
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
      validate121.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate121.errors = vErrors;
  return errors === 0;
}
function validate120(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate121(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate121.errors : vErrors.concat(validate121.errors);
    errors = vErrors.length;
  }
  validate120.errors = vErrors;
  return errors === 0;
}
var validateV2TurnSteerResponse = validate124;
function validate124(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  if (errors === _errs0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.turnId === void 0 && (missing0 = "turnId")) {
        validate124.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.turnId !== void 0) {
          if (typeof data.turnId !== "string") {
            validate124.errors = [{ instancePath: instancePath + "/turnId", schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/properties/turnId/type", keyword: "type", params: { type: "string" } }];
            return false;
          }
        }
      }
    } else {
      validate124.errors = [{ instancePath, schemaPath: "https://openai.com/codex/app-server-protocol.schema.json#/definitions/v2/TurnSteerResponse/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate124.errors = vErrors;
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
  validateV2TurnError,
  validateV2TurnInterruptResponse,
  validateV2TurnStartResponse,
  validateV2TurnSteerResponse
};
