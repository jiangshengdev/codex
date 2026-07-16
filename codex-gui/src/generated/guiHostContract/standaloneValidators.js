// GENERATED CODE! DO NOT MODIFY BY HAND!

// scripts/protocolValidators/standaloneValidators.raw.js
var validateGuiAuthenticateParams = validate10;
function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.token === void 0) {
      const err0 = { instancePath, schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateParams/required", keyword: "required", params: { missingProperty: "token" }, message: "must have required property 'token'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.token !== void 0) {
      if (typeof data.token !== "string") {
        const err1 = { instancePath: instancePath + "/token", schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateParams/properties/token/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
  } else {
    const err2 = { instancePath, schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateParams/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var validateGuiAuthenticateResult = validate12;
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.authenticated === void 0) {
      const err0 = { instancePath, schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateResult/required", keyword: "required", params: { missingProperty: "authenticated" }, message: "must have required property 'authenticated'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.authenticated !== void 0) {
      if (typeof data.authenticated !== "boolean") {
        const err1 = { instancePath: instancePath + "/authenticated", schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateResult/properties/authenticated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
  } else {
    const err2 = { instancePath, schemaPath: "https://openai.com/codex/gui-host-browser-contract.schema.json#/definitions/GuiAuthenticateResult/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  validate12.errors = vErrors;
  return errors === 0;
}
export {
  validateGuiAuthenticateParams,
  validateGuiAuthenticateResult
};
