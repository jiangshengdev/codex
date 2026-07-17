// GENERATED CODE! DO NOT MODIFY BY HAND!

// scripts/protocolValidators/standaloneValidators.raw.js
var validateJSONRPCMessage = validate10;
var schema16 = { "properties": { "traceparent": { "type": ["string", "null"] }, "tracestate": { "type": ["string", "null"] } }, "type": "object" };
function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.method === void 0 && (missing0 = "method")) {
        validate13.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.id !== void 0) {
          let data0 = data.id;
          const _errs1 = errors;
          const _errs3 = errors;
          let valid2 = false;
          const _errs4 = errors;
          if (typeof data0 !== "string") {
            const err0 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/0/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
          var _valid0 = _errs4 === errors;
          valid2 = valid2 || _valid0;
          if (!valid2) {
            const _errs6 = errors;
            if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
              const err1 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/1/type", keyword: "type", params: { type: "integer" } };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
            var _valid0 = _errs6 === errors;
            valid2 = valid2 || _valid0;
          }
          if (!valid2) {
            const err2 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
            validate13.errors = vErrors;
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
          if (data.method !== void 0) {
            const _errs8 = errors;
            if (typeof data.method !== "string") {
              validate13.errors = [{ instancePath: instancePath + "/method", schemaPath: "#/properties/method/type", keyword: "type", params: { type: "string" } }];
              return false;
            }
            var valid0 = _errs8 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.trace !== void 0) {
              let data2 = data.trace;
              const _errs10 = errors;
              const _errs11 = errors;
              let valid3 = false;
              const _errs12 = errors;
              const _errs13 = errors;
              if (errors === _errs13) {
                if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                  if (data2.traceparent !== void 0) {
                    let data3 = data2.traceparent;
                    const _errs15 = errors;
                    if (typeof data3 !== "string" && data3 !== null) {
                      const err3 = { instancePath: instancePath + "/trace/traceparent", schemaPath: "#/definitions/W3cTraceContext/properties/traceparent/type", keyword: "type", params: { type: schema16.properties.traceparent.type } };
                      if (vErrors === null) {
                        vErrors = [err3];
                      } else {
                        vErrors.push(err3);
                      }
                      errors++;
                    }
                    var valid5 = _errs15 === errors;
                  } else {
                    var valid5 = true;
                  }
                  if (valid5) {
                    if (data2.tracestate !== void 0) {
                      let data4 = data2.tracestate;
                      const _errs17 = errors;
                      if (typeof data4 !== "string" && data4 !== null) {
                        const err4 = { instancePath: instancePath + "/trace/tracestate", schemaPath: "#/definitions/W3cTraceContext/properties/tracestate/type", keyword: "type", params: { type: schema16.properties.tracestate.type } };
                        if (vErrors === null) {
                          vErrors = [err4];
                        } else {
                          vErrors.push(err4);
                        }
                        errors++;
                      }
                      var valid5 = _errs17 === errors;
                    } else {
                      var valid5 = true;
                    }
                  }
                } else {
                  const err5 = { instancePath: instancePath + "/trace", schemaPath: "#/definitions/W3cTraceContext/type", keyword: "type", params: { type: "object" } };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
              }
              var _valid1 = _errs12 === errors;
              valid3 = valid3 || _valid1;
              if (!valid3) {
                const _errs19 = errors;
                if (data2 !== null) {
                  const err6 = { instancePath: instancePath + "/trace", schemaPath: "#/properties/trace/anyOf/1/type", keyword: "type", params: { type: "null" } };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                var _valid1 = _errs19 === errors;
                valid3 = valid3 || _valid1;
              }
              if (!valid3) {
                const err7 = { instancePath: instancePath + "/trace", schemaPath: "#/properties/trace/anyOf", keyword: "anyOf", params: {} };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
                validate13.errors = vErrors;
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
    } else {
      validate13.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate13.errors = vErrors;
  return errors === 0;
}
function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.id === void 0 && (missing0 = "id") || data.result === void 0 && (missing0 = "result")) {
        validate15.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.id !== void 0) {
          let data0 = data.id;
          const _errs3 = errors;
          let valid2 = false;
          const _errs4 = errors;
          if (typeof data0 !== "string") {
            const err0 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/0/type", keyword: "type", params: { type: "string" } };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
          var _valid0 = _errs4 === errors;
          valid2 = valid2 || _valid0;
          if (!valid2) {
            const _errs6 = errors;
            if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
              const err1 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/1/type", keyword: "type", params: { type: "integer" } };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
            var _valid0 = _errs6 === errors;
            valid2 = valid2 || _valid0;
          }
          if (!valid2) {
            const err2 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf", keyword: "anyOf", params: {} };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
            validate15.errors = vErrors;
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
        }
      }
    } else {
      validate15.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" } }];
      return false;
    }
  }
  validate15.errors = vErrors;
  return errors === 0;
}
function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.error === void 0 && (missing0 = "error") || data.id === void 0 && (missing0 = "id")) {
        validate17.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 } }];
        return false;
      } else {
        if (data.error !== void 0) {
          let data0 = data.error;
          const _errs1 = errors;
          const _errs2 = errors;
          if (errors === _errs2) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing1;
              if (data0.code === void 0 && (missing1 = "code") || data0.message === void 0 && (missing1 = "message")) {
                validate17.errors = [{ instancePath: instancePath + "/error", schemaPath: "#/definitions/JSONRPCErrorError/required", keyword: "required", params: { missingProperty: missing1 } }];
                return false;
              } else {
                if (data0.code !== void 0) {
                  let data1 = data0.code;
                  const _errs4 = errors;
                  if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                    validate17.errors = [{ instancePath: instancePath + "/error/code", schemaPath: "#/definitions/JSONRPCErrorError/properties/code/type", keyword: "type", params: { type: "integer" } }];
                    return false;
                  }
                  var valid2 = _errs4 === errors;
                } else {
                  var valid2 = true;
                }
                if (valid2) {
                  if (data0.message !== void 0) {
                    const _errs6 = errors;
                    if (typeof data0.message !== "string") {
                      validate17.errors = [{ instancePath: instancePath + "/error/message", schemaPath: "#/definitions/JSONRPCErrorError/properties/message/type", keyword: "type", params: { type: "string" } }];
                      return false;
                    }
                    var valid2 = _errs6 === errors;
                  } else {
                    var valid2 = true;
                  }
                }
              }
            } else {
              validate17.errors = [{ instancePath: instancePath + "/error", schemaPath: "#/definitions/JSONRPCErrorError/type", keyword: "type", params: { type: "object" } }];
              return false;
            }
          }
          var valid0 = _errs1 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.id !== void 0) {
            let data3 = data.id;
            const _errs8 = errors;
            const _errs10 = errors;
            let valid4 = false;
            const _errs11 = errors;
            if (typeof data3 !== "string") {
              const err0 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/0/type", keyword: "type", params: { type: "string" } };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
            var _valid0 = _errs11 === errors;
            valid4 = valid4 || _valid0;
            if (!valid4) {
              const _errs13 = errors;
              if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                const err1 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf/1/type", keyword: "type", params: { type: "integer" } };
                if (vErrors === null) {
                  vErrors = [err1];
                } else {
                  vErrors.push(err1);
                }
                errors++;
              }
              var _valid0 = _errs13 === errors;
              valid4 = valid4 || _valid0;
            }
            if (!valid4) {
              const err2 = { instancePath: instancePath + "/id", schemaPath: "#/definitions/v2/RequestId/anyOf", keyword: "anyOf", params: {} };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
              validate17.errors = vErrors;
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
            var valid0 = _errs8 === errors;
          } else {
            var valid0 = true;
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
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  if (!validate13(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs2 = errors;
    const _errs3 = errors;
    if (errors === _errs3) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing0;
        if (data.method === void 0 && (missing0 = "method")) {
          const err0 = { instancePath, schemaPath: "#/definitions/JSONRPCNotification/required", keyword: "required", params: { missingProperty: missing0 } };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        } else {
          if (data.method !== void 0) {
            if (typeof data.method !== "string") {
              const err1 = { instancePath: instancePath + "/method", schemaPath: "#/definitions/JSONRPCNotification/properties/method/type", keyword: "type", params: { type: "string" } };
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
        const err2 = { instancePath, schemaPath: "#/definitions/JSONRPCNotification/type", keyword: "type", params: { type: "object" } };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const _errs7 = errors;
      if (!validate15(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs7 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs8 = errors;
        if (!validate17(data, { instancePath, parentData, parentDataProperty, rootData })) {
          vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs8 === errors;
        valid0 = valid0 || _valid0;
      }
    }
  }
  if (!valid0) {
    const err3 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {} };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
    validate12.errors = vErrors;
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
export {
  validateJSONRPCMessage
};
