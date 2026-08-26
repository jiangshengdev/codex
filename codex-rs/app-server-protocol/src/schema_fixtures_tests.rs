use crate::export::GenerateTsOptions;
use crate::export::generate_internal_json_schema;
use crate::export::generate_json_with_experimental;
use crate::export::generate_ts_with_options;
use crate::precomputed_exports::decode_precomputed_exports;
use crate::schema_fixtures::SchemaFixtureOptions;
use crate::schema_fixtures::collect_export_files_recursive;
use crate::schema_fixtures::generate_typescript_schema_fixture_subtree_for_tests;
use crate::schema_fixtures::read_schema_fixture_subtree;
use crate::schema_fixtures::write_schema_fixtures_with_options;
use anyhow::Context;
use anyhow::Result;
use pretty_assertions::assert_eq;
use serde_json::Value;
use serde_json::json;
use similar::TextDiff;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::path::Path;
use std::path::PathBuf;

#[test]
fn typescript_schema_fixtures_match_generated() -> Result<()> {
    let schema_root = schema_root()?;
    let fixture_tree = read_tree(&schema_root, "typescript")?;
    let generated_tree = generate_typescript_schema_fixture_subtree_for_tests()
        .context("generate in-memory typescript schema fixtures")?;

    assert_jsonrpc_message_typescript_fixture(&generated_tree)?;

    assert_schema_trees_match("typescript", &fixture_tree, &generated_tree)?;
    let config_requirements = generated_tree
        .get(Path::new("v2/ConfigRequirements.ts"))
        .context("generated ConfigRequirements.ts should exist")?;
    anyhow::ensure!(
        !String::from_utf8_lossy(config_requirements).contains("../PathUri")
            || generated_tree.contains_key(Path::new("PathUri.ts")),
        "stable ConfigRequirements.ts imports PathUri but PathUri.ts was not generated"
    );

    Ok(())
}

fn assert_jsonrpc_message_typescript_fixture(
    generated_tree: &BTreeMap<PathBuf, Vec<u8>>,
) -> Result<()> {
    let message = generated_tree
        .get(Path::new("JSONRPCMessage.ts"))
        .context("fresh generation must include JSONRPCMessage.ts")?;
    let message =
        String::from_utf8(message.clone()).context("JSONRPCMessage.ts should be UTF-8")?;
    let compact_message = message
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    for expected in [
        r#"importtype{JSONRPCError}from"./JSONRPCError";"#,
        r#"importtype{JSONRPCNotification}from"./JSONRPCNotification";"#,
        r#"importtype{JSONRPCRequest}from"./JSONRPCRequest";"#,
        r#"importtype{JSONRPCResponse}from"./JSONRPCResponse";"#,
        "exporttypeJSONRPCMessage=JSONRPCRequest|JSONRPCNotification|JSONRPCResponse|JSONRPCError;",
    ] {
        assert!(
            compact_message.contains(expected),
            "JSONRPCMessage.ts is missing `{expected}`\n\n{message}"
        );
    }

    let index = generated_tree
        .get(Path::new("index.ts"))
        .context("fresh generation must include index.ts")?;
    let index = String::from_utf8(index.clone()).context("index.ts should be UTF-8")?;
    for type_name in [
        "JSONRPCError",
        "JSONRPCErrorError",
        "JSONRPCMessage",
        "JSONRPCNotification",
        "JSONRPCRequest",
        "JSONRPCResponse",
        "RequestId",
        "W3cTraceContext",
    ] {
        let path = PathBuf::from(format!("{type_name}.ts"));
        assert!(
            generated_tree.contains_key(&path),
            "fresh generation is missing JSONRPCMessage dependency {}",
            path.display()
        );
        let expected_export = format!("export type {{ {type_name} }} from \"./{type_name}\";");
        assert!(
            index.contains(&expected_export),
            "generated index.ts is missing `{expected_export}`\n\n{index}"
        );
    }

    let error = generated_tree
        .get(Path::new("JSONRPCErrorError.ts"))
        .context("fresh generation must include JSONRPCErrorError.ts")?;
    let error = String::from_utf8(error.clone()).context("JSONRPCErrorError.ts should be UTF-8")?;
    let compact_error = error
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    assert!(
        compact_error.contains("code:number"),
        "JSONRPCErrorError.code must be exported as number\n\n{error}"
    );
    assert!(
        !compact_error.contains("bigint"),
        "JSONRPCErrorError.ts must not expose bigint\n\n{error}"
    );

    Ok(())
}

#[test]
fn json_schema_fixtures_match_generated() -> Result<()> {
    assert_schema_fixtures_match_generated("json", |output_dir| {
        generate_json_with_experimental(output_dir, /*experimental_api*/ false)
    })
}

#[test]
fn stable_precomputed_exports_match_schema_fixtures() -> Result<()> {
    let schema_root = schema_root()?;
    let exports = decode_precomputed_exports(/*experimental_api*/ false)?;

    assert_eq!(
        exports.typescript,
        collect_export_files_recursive(&schema_root.join("typescript"))?
    );
    assert_eq!(
        exports.json_schema,
        collect_export_files_recursive(&schema_root.join("json"))?
    );

    let internal_dir = tempfile::tempdir().context("create internal schema temp dir")?;
    generate_internal_json_schema(internal_dir.path())?;
    assert_json_export_trees_match(
        &exports.internal_json_schema,
        &collect_export_files_recursive(internal_dir.path())?,
    )?;
    Ok(())
}

#[test]
fn experimental_precomputed_exports_match_generated() -> Result<()> {
    let output_dir = tempfile::tempdir().context("create experimental schema temp dir")?;
    let typescript_dir = output_dir.path().join("typescript");
    let json_dir = output_dir.path().join("json");
    generate_ts_with_options(
        &typescript_dir,
        /*prettier*/ None,
        GenerateTsOptions {
            experimental_api: true,
            ..GenerateTsOptions::default()
        },
    )?;
    generate_json_with_experimental(&json_dir, /*experimental_api*/ true)?;

    let exports = decode_precomputed_exports(/*experimental_api*/ true)?;
    assert_eq!(
        exports.typescript,
        collect_export_files_recursive(&typescript_dir)?
    );
    assert_json_export_trees_match(
        &exports.json_schema,
        &collect_export_files_recursive(&json_dir)?,
    )?;
    assert_eq!(exports.internal_json_schema, BTreeMap::new());
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
struct TypeScriptFieldContract {
    optional: bool,
    nullable: bool,
}

#[test]
fn response_field_presence_matches_typescript_contract() -> Result<()> {
    let output_dir = tempfile::tempdir().context("create response contract temp dir")?;

    for (view, experimental_api) in [("stable", false), ("experimental", true)] {
        let view_dir = output_dir.path().join(view);
        let typescript_dir = view_dir.join("typescript");
        let json_dir = view_dir.join("json");
        generate_ts_with_options(
            &typescript_dir,
            /*prettier*/ None,
            GenerateTsOptions {
                experimental_api,
                ..GenerateTsOptions::default()
            },
        )
        .with_context(|| format!("generate fresh {view} TypeScript response contracts"))?;
        generate_json_with_experimental(&json_dir, experimental_api)
            .with_context(|| format!("generate fresh {view} JSON response contracts"))?;

        assert_response_field_contracts(view, &typescript_dir, &json_dir)?;
    }

    Ok(())
}

fn assert_response_field_contracts(
    view: &str,
    typescript_dir: &Path,
    json_dir: &Path,
) -> Result<()> {
    let manifest_path = json_dir.join("client-request-definitions.json");
    let manifest: Vec<Value> = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .with_context(|| format!("read fresh {view} request manifest"))?,
    )
    .with_context(|| format!("parse fresh {view} request manifest"))?;
    let bundle_path = json_dir.join("codex_app_server_protocol.schemas.json");
    let bundle: Value = serde_json::from_slice(
        &std::fs::read(&bundle_path)
            .with_context(|| format!("read fresh {view} JSON schema bundle"))?,
    )
    .with_context(|| format!("parse fresh {view} JSON schema bundle"))?;

    let response_schema_ids = manifest
        .iter()
        .filter_map(|definition| definition["responseSchema"].as_str())
        .filter(|schema_id| schema_id.starts_with("v2/"))
        .collect::<BTreeSet<_>>();

    for response_schema_id in response_schema_ids {
        let response_schema = schema_definition(&bundle, response_schema_id)
            .with_context(|| format!("resolve {view} JSON response schema {response_schema_id}"))?;
        let Some(properties) = response_schema.get("properties").and_then(Value::as_object) else {
            continue;
        };
        let response_name = response_schema_id
            .rsplit('/')
            .next()
            .context("response schema ID should contain a type name")?;
        let typescript_path = typescript_dir.join(format!("{response_schema_id}.ts"));
        let typescript = std::fs::read_to_string(&typescript_path).with_context(|| {
            format!(
                "read fresh {view} TypeScript response {}",
                typescript_path.display()
            )
        })?;
        let typescript_fields =
            parse_typescript_object_fields(&typescript, &typescript_path, response_name)
                .with_context(|| {
                    format!("parse {view} TypeScript response {response_schema_id}")
                })?;
        let required = response_schema
            .get("required")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect::<BTreeSet<_>>();
        let typescript_field_names = typescript_fields
            .keys()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let json_field_names = properties
            .keys()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();

        assert_eq!(
            typescript_field_names, json_field_names,
            "{view} response {response_schema_id} has different TypeScript and JSON Schema fields"
        );

        for (field_name, contract) in &typescript_fields {
            if contract.optional || contract.nullable {
                let json_required = required.contains(field_name.as_str());
                assert_eq!(
                    json_required, !contract.optional,
                    "{view} response {response_schema_id}.{field_name} presence differs: TypeScript optional={}, JSON Schema required={json_required}",
                    contract.optional
                );
                let property_schema = properties.get(field_name).with_context(|| {
                    format!("missing {view} JSON response field {response_schema_id}.{field_name}")
                })?;
                let json_nullable = schema_accepts_null(property_schema, &bundle)?;
                assert_eq!(
                    json_nullable, contract.nullable,
                    "{view} response {response_schema_id}.{field_name} nullability differs: TypeScript nullable={}, JSON Schema nullable={json_nullable}",
                    contract.nullable
                );
            }
        }
    }

    Ok(())
}

fn schema_definition<'a>(bundle: &'a Value, schema_id: &str) -> Result<&'a Value> {
    schema_id
        .split('/')
        .try_fold(&bundle["definitions"], |definitions, segment| {
            definitions
                .get(segment)
                .with_context(|| format!("missing schema definition segment {segment:?}"))
        })
}

fn parse_typescript_object_fields(
    typescript: &str,
    typescript_path: &Path,
    type_name: &str,
) -> Result<BTreeMap<String, TypeScriptFieldContract>> {
    let marker = format!("export type {type_name} =");
    let declaration = typescript
        .split_once(&marker)
        .map(|(_, declaration)| declaration)
        .with_context(|| format!("missing TypeScript declaration {marker:?}"))?;
    let declaration = strip_typescript_comments(declaration);
    if declaration
        .trim_start()
        .starts_with("Record<string, never>")
    {
        return Ok(BTreeMap::new());
    }
    let object_start = declaration
        .find('{')
        .context("TypeScript response should be an object type")?;
    let object_end = declaration
        .rfind('}')
        .context("TypeScript response object should have a closing brace")?;
    let body = &declaration[object_start + 1..object_end];
    let mut fields = BTreeMap::new();

    for field in split_top_level(body, ',') {
        let field = field.trim();
        if field.is_empty() {
            continue;
        }
        let colon = field
            .find(':')
            .with_context(|| format!("TypeScript field is missing a colon: {field:?}"))?;
        let name = field[..colon].trim();
        let (name, optional) = match name.strip_suffix('?') {
            Some(name) => (name.trim(), true),
            None => (name, false),
        };
        let name = if name.starts_with('"') {
            serde_json::from_str::<String>(name)
                .with_context(|| format!("decode quoted TypeScript field name {name:?}"))?
        } else {
            anyhow::ensure!(
                !name.is_empty()
                    && name
                        .chars()
                        .all(|character| character == '_' || character.is_ascii_alphanumeric()),
                "unsupported TypeScript field name {name:?}"
            );
            name.to_string()
        };
        let field_type = field[colon + 1..].trim();
        let nullable = typescript_type_accepts_null(
            field_type,
            typescript,
            typescript_path,
            &mut BTreeSet::new(),
        )?;
        let previous = fields.insert(name.clone(), TypeScriptFieldContract { optional, nullable });
        anyhow::ensure!(previous.is_none(), "duplicate TypeScript field {name:?}");
    }

    Ok(fields)
}

fn typescript_type_accepts_null(
    field_type: &str,
    source: &str,
    source_path: &Path,
    visiting: &mut BTreeSet<(PathBuf, String)>,
) -> Result<bool> {
    let members = split_top_level(field_type, '|');
    if members
        .iter()
        .any(|member| matches!(member.trim(), "null" | "any" | "unknown"))
    {
        return Ok(true);
    }

    for member in members {
        let member = member.trim();
        if member.is_empty()
            || !member
                .chars()
                .all(|character| character == '_' || character.is_ascii_alphanumeric())
        {
            continue;
        }
        let Some((import_path, imported_name)) =
            imported_typescript_type_path(source, source_path, member)?
        else {
            continue;
        };
        let key = (import_path.clone(), imported_name.clone());
        if !visiting.insert(key.clone()) {
            continue;
        }
        let imported_source = std::fs::read_to_string(&import_path)
            .with_context(|| format!("read imported TypeScript type {}", import_path.display()))?;
        let marker = format!("export type {imported_name} =");
        let declaration = imported_source
            .split_once(&marker)
            .map(|(_, declaration)| declaration)
            .with_context(|| {
                format!(
                    "missing imported TypeScript declaration {marker:?} in {}",
                    import_path.display()
                )
            })?;
        let declaration = strip_typescript_comments(declaration);
        let alias = split_top_level(&declaration, ';')
            .into_iter()
            .next()
            .context("imported TypeScript alias should have a declaration")?
            .trim();
        let nullable =
            typescript_type_accepts_null(alias, &imported_source, &import_path, visiting)?;
        visiting.remove(&key);
        if nullable {
            return Ok(true);
        }
    }

    Ok(false)
}

fn imported_typescript_type_path(
    source: &str,
    source_path: &Path,
    type_name: &str,
) -> Result<Option<(PathBuf, String)>> {
    for line in source.lines().map(str::trim) {
        let Some(import) = line.strip_prefix("import type {") else {
            continue;
        };
        let Some((bindings, module)) = import.split_once('}') else {
            continue;
        };
        let imported_name = bindings.split(',').find_map(|binding| {
            let binding = binding.trim();
            let (imported_name, local_name) = binding
                .split_once(" as ")
                .map_or((binding, binding), |(imported_name, local_name)| {
                    (imported_name.trim(), local_name.trim())
                });
            (local_name == type_name).then(|| imported_name.to_string())
        });
        let Some(imported_name) = imported_name else {
            continue;
        };
        let module = module
            .trim()
            .strip_prefix("from ")
            .context("TypeScript type import should contain `from`")?
            .trim_end_matches(';')
            .trim();
        let module = serde_json::from_str::<String>(module)
            .with_context(|| format!("decode TypeScript import module {module:?}"))?;
        let parent = source_path
            .parent()
            .context("TypeScript source should have a parent directory")?;
        let import_path = parent.join(module).with_extension("ts");
        return Ok(Some((
            std::fs::canonicalize(&import_path).with_context(|| {
                format!("resolve imported TypeScript type {}", import_path.display())
            })?,
            imported_name,
        )));
    }

    Ok(None)
}

fn strip_typescript_comments(source: &str) -> String {
    let mut result = String::with_capacity(source.len());
    let mut characters = source.chars().peekable();
    while let Some(character) = characters.next() {
        if character != '/' {
            result.push(character);
            continue;
        }
        match characters.peek() {
            Some('/') => {
                characters.next();
                for character in characters.by_ref() {
                    if character == '\n' {
                        result.push('\n');
                        break;
                    }
                }
            }
            Some('*') => {
                characters.next();
                let mut previous = '\0';
                for character in characters.by_ref() {
                    if previous == '*' && character == '/' {
                        break;
                    }
                    previous = character;
                }
                result.push(' ');
            }
            _ => result.push(character),
        }
    }
    result
}

fn split_top_level(source: &str, delimiter: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut delimiters = Vec::new();
    for (index, character) in source.char_indices() {
        match character {
            '{' => delimiters.push('}'),
            '[' => delimiters.push(']'),
            '(' => delimiters.push(')'),
            '<' => delimiters.push('>'),
            '}' | ']' | ')' | '>' if delimiters.last() == Some(&character) => {
                delimiters.pop();
            }
            _ if character == delimiter && delimiters.is_empty() => {
                parts.push(&source[start..index]);
                start = index + character.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&source[start..]);
    parts
}

fn schema_accepts_null(schema: &Value, bundle: &Value) -> Result<bool> {
    let Value::Object(schema) = schema else {
        return Ok(schema.as_bool().unwrap_or(false));
    };

    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let reference = reference
            .strip_prefix("#/definitions/")
            .with_context(|| format!("unsupported schema reference {reference:?}"))?;
        return schema_accepts_null(schema_definition(bundle, reference)?, bundle);
    }

    let mut accepts_null = true;
    if let Some(types) = schema.get("type") {
        accepts_null &= match types {
            Value::String(schema_type) => schema_type == "null",
            Value::Array(schema_types) => schema_types
                .iter()
                .any(|value| value.as_str() == Some("null")),
            _ => false,
        };
    }
    if let Some(constant) = schema.get("const") {
        accepts_null &= constant.is_null();
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        accepts_null &= values.iter().any(Value::is_null);
    }
    if let Some(schemas) = schema.get("anyOf").and_then(Value::as_array) {
        accepts_null &= schemas
            .iter()
            .map(|schema| schema_accepts_null(schema, bundle))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .any(|accepts_null| accepts_null);
    }
    if let Some(schemas) = schema.get("oneOf").and_then(Value::as_array) {
        accepts_null &= schemas
            .iter()
            .map(|schema| schema_accepts_null(schema, bundle))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .filter(|accepts_null| *accepts_null)
            .count()
            == 1;
    }
    if let Some(schemas) = schema.get("allOf").and_then(Value::as_array) {
        accepts_null &= schemas
            .iter()
            .map(|schema| schema_accepts_null(schema, bundle))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .all(|accepts_null| accepts_null);
    }
    if let Some(negated) = schema.get("not") {
        accepts_null &= !schema_accepts_null(negated, bundle)?;
    }

    Ok(accepts_null)
}

#[test]
fn client_request_definitions_export_method_params_and_response() -> Result<()> {
    let generated_tree = generate_typescript_schema_fixture_subtree_for_tests()
        .context("generate in-memory typescript schema fixtures")?;
    let typescript = generated_tree
        .get(Path::new("ClientRequestDefinition.ts"))
        .context("generated ClientRequestDefinition.ts")?;
    let typescript = String::from_utf8(typescript.clone())
        .context("ClientRequestDefinition.ts should be UTF-8")?;
    let compact_typescript = typescript
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();

    for expected in [
        r#"importtype{GetAccountTokenUsageParams}from"./v2/GetAccountTokenUsageParams";"#,
        r#"{method:"initialize";params:InitializeParams;response:InitializeResponse;}"#,
        r#"{method:"thread/projection/attach";params:ThreadProjectionAttachParams;response:ThreadProjectionAttachResponse;}"#,
        r#"{method:"turn/start";params:TurnStartParams;response:TurnStartResponse;}"#,
        r#"{method:"turn/interrupt";params:TurnInterruptParams;response:TurnInterruptResponse;}"#,
        r#"{method:"config/mcpServer/reload";params:undefined;response:McpServerRefreshResponse;}"#,
        r#"{method:"account/usage/read";params:GetAccountTokenUsageParams|null;response:GetAccountTokenUsageResponse;}"#,
    ] {
        assert!(
            compact_typescript.contains(expected),
            "ClientRequestDefinition.ts is missing `{expected}`\n\n{typescript}"
        );
    }
    assert!(
        !compact_typescript.contains(r#"method:"threadProjectionAttach""#),
        "renamed methods must use their wire method, not the Rust variant name"
    );

    let temp_dir = tempfile::tempdir().context("create temp dir")?;
    let typescript_dir = temp_dir.path().join("typescript");
    generate_ts_with_options(
        &typescript_dir,
        /*prettier*/ None,
        GenerateTsOptions {
            experimental_api: true,
            ..GenerateTsOptions::default()
        },
    )
    .context("generate experimental TypeScript schema fixtures")?;
    let experimental_typescript_path = typescript_dir.join("ClientRequestDefinition.ts");
    let experimental_typescript = std::fs::read_to_string(&experimental_typescript_path)
        .with_context(|| format!("read {}", experimental_typescript_path.display()))?;
    let compact_experimental_typescript = experimental_typescript
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();

    for expected in [
        r#"importtype{RemoteControlEnableParams}from"./v2/RemoteControlEnableParams";"#,
        r#"importtype{RemoteControlDisableParams}from"./v2/RemoteControlDisableParams";"#,
        r#"{method:"remoteControl/enable";params:RemoteControlEnableParams|null;response:RemoteControlEnableResponse;}"#,
        r#"{method:"remoteControl/disable";params:RemoteControlDisableParams|null;response:RemoteControlDisableResponse;}"#,
    ] {
        assert!(
            compact_experimental_typescript.contains(expected),
            "experimental ClientRequestDefinition.ts is missing `{expected}`\n\n{experimental_typescript}"
        );
    }

    let json_dir = temp_dir.path().join("json");
    generate_json_with_experimental(&json_dir, /*experimental_api*/ true)
        .context("generate JSON schema fixtures")?;
    let manifest_path = json_dir.join("client-request-definitions.json");
    let manifest: Vec<Value> = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .with_context(|| format!("read {}", manifest_path.display()))?,
    )
    .with_context(|| format!("parse {}", manifest_path.display()))?;

    for expected in [
        json!({
            "method": "initialize",
            "paramsSchema": "InitializeParams",
            "responseSchema": "InitializeResponse",
        }),
        json!({
            "method": "thread/projection/attach",
            "paramsSchema": "v2/ThreadProjectionAttachParams",
            "responseSchema": "v2/ThreadProjectionAttachResponse",
        }),
        json!({
            "method": "turn/start",
            "paramsSchema": "v2/TurnStartParams",
            "responseSchema": "v2/TurnStartResponse",
        }),
        json!({
            "method": "turn/interrupt",
            "paramsSchema": "v2/TurnInterruptParams",
            "responseSchema": "v2/TurnInterruptResponse",
        }),
        json!({
            "method": "config/mcpServer/reload",
            "paramsSchema": null,
            "responseSchema": "v2/McpServerRefreshResponse",
        }),
        json!({
            "method": "account/usage/read",
            "paramsSchema": "v2/GetAccountTokenUsageParams",
            "responseSchema": "v2/GetAccountTokenUsageResponse",
        }),
        json!({
            "method": "remoteControl/enable",
            "paramsSchema": "v2/RemoteControlEnableParams",
            "responseSchema": "v2/RemoteControlEnableResponse",
        }),
        json!({
            "method": "remoteControl/disable",
            "paramsSchema": "v2/RemoteControlDisableParams",
            "responseSchema": "v2/RemoteControlDisableResponse",
        }),
    ] {
        let method = expected["method"]
            .as_str()
            .context("expected method string")?;
        let actual = manifest
            .iter()
            .find(|definition| definition["method"].as_str() == Some(method))
            .with_context(|| format!("missing request definition for {method}"))?;
        assert_eq!(&expected, actual);
    }
    assert!(
        manifest
            .iter()
            .all(|definition| definition["method"].as_str() != Some("threadProjectionAttach")),
        "renamed methods must use their wire method, not the Rust variant name"
    );

    let bundle_path = json_dir.join("codex_app_server_protocol.schemas.json");
    let bundle: Value = serde_json::from_slice(
        &std::fs::read(&bundle_path).with_context(|| format!("read {}", bundle_path.display()))?,
    )
    .with_context(|| format!("parse {}", bundle_path.display()))?;
    let v2_definitions = bundle["definitions"]["v2"]
        .as_object()
        .context("schema bundle v2 definitions object")?;
    for schema_id in [
        "v2/RemoteControlEnableParams",
        "v2/RemoteControlDisableParams",
    ] {
        let definition_name = schema_id
            .strip_prefix("v2/")
            .context("v2 schema ID prefix")?;
        assert!(
            v2_definitions.contains_key(definition_name),
            "schema bundle is missing `{schema_id}`"
        );
    }
    Ok(())
}

#[test]
fn server_notification_definitions_export_method_and_params_schema() -> Result<()> {
    let temp_dir = tempfile::tempdir().context("create temp dir")?;
    let json_dir = temp_dir.path().join("json");
    generate_json_with_experimental(&json_dir, /*experimental_api*/ false)
        .context("generate JSON schema fixtures")?;
    let manifest_path = json_dir.join("server-notification-definitions.json");
    let manifest: Vec<Value> = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .with_context(|| format!("read {}", manifest_path.display()))?,
    )
    .with_context(|| format!("parse {}", manifest_path.display()))?;

    for expected in [
        json!({
            "method": "thread/projection/event",
            "paramsSchema": "v2/ThreadProjectionEventNotification",
        }),
        json!({
            "method": "thread/projection/delta",
            "paramsSchema": "v2/ThreadProjectionDeltaNotification",
        }),
        json!({
            "method": "thread/projection/closed",
            "paramsSchema": "v2/ThreadProjectionClosedNotification",
        }),
    ] {
        let method = expected["method"]
            .as_str()
            .context("expected method string")?;
        let actual = manifest
            .iter()
            .find(|definition| definition["method"].as_str() == Some(method))
            .with_context(|| format!("missing notification definition for {method}"))?;
        assert_eq!(&expected, actual);
    }

    let methods = manifest
        .iter()
        .map(|definition| {
            definition["method"]
                .as_str()
                .context("notification definition method string")
        })
        .collect::<Result<Vec<_>>>()?;
    assert_eq!(methods.len(), methods.iter().collect::<BTreeSet<_>>().len());
    assert!(!methods.contains(&"process/outputDelta"));

    let experimental_json_dir = temp_dir.path().join("experimental-json");
    generate_json_with_experimental(&experimental_json_dir, /*experimental_api*/ true)
        .context("generate experimental JSON schema fixtures")?;
    let experimental_manifest_path =
        experimental_json_dir.join("server-notification-definitions.json");
    let experimental_manifest: Vec<Value> = serde_json::from_slice(
        &std::fs::read(&experimental_manifest_path)
            .with_context(|| format!("read {}", experimental_manifest_path.display()))?,
    )
    .with_context(|| format!("parse {}", experimental_manifest_path.display()))?;
    let experimental_methods = experimental_manifest
        .iter()
        .map(|definition| {
            definition["method"]
                .as_str()
                .context("experimental notification definition method string")
        })
        .collect::<Result<Vec<_>>>()?;
    assert!(experimental_methods.contains(&"process/outputDelta"));

    Ok(())
}

#[test]
fn jsonrpc_message_schema_keeps_payloads_opaque() -> Result<()> {
    let temp_dir = tempfile::tempdir().context("create temp dir")?;
    let json_dir = temp_dir.path().join("json");
    generate_json_with_experimental(&json_dir, /*experimental_api*/ false)
        .context("generate JSON schema fixtures")?;
    let jsonrpc_path = json_dir.join("JSONRPCMessage.json");
    let jsonrpc_source = std::fs::read_to_string(&jsonrpc_path)
        .with_context(|| format!("read {}", jsonrpc_path.display()))?;
    let jsonrpc: Value = serde_json::from_str(&jsonrpc_source)
        .with_context(|| format!("parse {}", jsonrpc_path.display()))?;

    assert_eq!(
        json!([
            {"$ref": "#/definitions/JSONRPCRequest"},
            {"$ref": "#/definitions/JSONRPCNotification"},
            {"$ref": "#/definitions/JSONRPCResponse"},
            {"$ref": "#/definitions/JSONRPCError"},
        ]),
        jsonrpc["anyOf"]
    );
    assert_eq!(
        json!(true),
        jsonrpc["definitions"]["JSONRPCNotification"]["properties"]["params"]
    );
    assert_eq!(
        json!(true),
        jsonrpc["definitions"]["JSONRPCRequest"]["properties"]["params"]
    );
    assert_eq!(
        json!(true),
        jsonrpc["definitions"]["JSONRPCResponse"]["properties"]["result"]
    );
    assert!(!jsonrpc_source.contains("ServerNotification"));
    assert!(!jsonrpc_source.contains("ThreadProjectionEventNotification"));

    Ok(())
}

#[test]
#[ignore = "invoked by `just write-app-server-schema`"]
fn write_schema_fixtures_from_env() -> Result<()> {
    let schema_root = std::env::var_os("CODEX_APP_SERVER_SCHEMA_ROOT")
        .map(PathBuf::from)
        .context("CODEX_APP_SERVER_SCHEMA_ROOT must be set")?;
    let prettier = std::env::var_os("CODEX_APP_SERVER_SCHEMA_PRETTIER").map(PathBuf::from);
    let experimental = std::env::var("CODEX_APP_SERVER_SCHEMA_EXPERIMENTAL")
        .context("CODEX_APP_SERVER_SCHEMA_EXPERIMENTAL must be set")?;
    let experimental_api = match experimental.as_str() {
        "0" => false,
        "1" => true,
        value => {
            anyhow::bail!("CODEX_APP_SERVER_SCHEMA_EXPERIMENTAL must be 0 or 1, got {value:?}")
        }
    };

    write_schema_fixtures_with_options(
        &schema_root,
        prettier.as_deref(),
        SchemaFixtureOptions { experimental_api },
    )
}

fn assert_schema_fixtures_match_generated(
    label: &'static str,
    generate: impl FnOnce(&Path) -> Result<()>,
) -> Result<()> {
    let schema_root = schema_root()?;
    let fixture_tree = read_tree(&schema_root, label)?;

    let temp_dir = tempfile::tempdir().context("create temp dir")?;
    let generated_root = temp_dir.path().join(label);
    generate(&generated_root).with_context(|| {
        format!(
            "generate {label} schema fixtures into {}",
            generated_root.display()
        )
    })?;

    let generated_tree = read_tree(temp_dir.path(), label)?;
    assert_schema_trees_match(label, &fixture_tree, &generated_tree)
}

fn assert_json_export_trees_match(
    expected: &BTreeMap<String, String>,
    actual: &BTreeMap<String, String>,
) -> Result<()> {
    assert_eq!(
        expected.keys().collect::<Vec<_>>(),
        actual.keys().collect::<Vec<_>>()
    );
    for (path, expected) in expected {
        let expected: serde_json::Value = serde_json::from_str(expected)
            .with_context(|| format!("parse precomputed JSON export {path}"))?;
        let actual: serde_json::Value = serde_json::from_str(&actual[path])
            .with_context(|| format!("parse freshly generated JSON export {path}"))?;
        assert_eq!(expected, actual, "JSON export differs: {path}");
    }
    Ok(())
}

fn assert_schema_trees_match(
    label: &str,
    fixture_tree: &BTreeMap<PathBuf, Vec<u8>>,
    generated_tree: &BTreeMap<PathBuf, Vec<u8>>,
) -> Result<()> {
    let fixture_paths = fixture_tree
        .keys()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>();
    let generated_paths = generated_tree
        .keys()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>();

    if fixture_paths != generated_paths {
        let expected = fixture_paths.join("\n");
        let actual = generated_paths.join("\n");
        let diff = TextDiff::from_lines(&expected, &actual)
            .unified_diff()
            .header("fixture", "generated")
            .to_string();

        panic!(
            "Vendored {label} app-server schema fixture file set doesn't match freshly generated output. \
Run `just write-app-server-schema` to overwrite with your changes.\n\n{diff}"
        );
    }

    for (path, expected) in fixture_tree {
        let actual = generated_tree
            .get(path)
            .ok_or_else(|| anyhow::anyhow!("missing generated file: {}", path.display()))?;

        if expected == actual {
            continue;
        }

        let expected_str = String::from_utf8_lossy(expected);
        let actual_str = String::from_utf8_lossy(actual);
        let diff = TextDiff::from_lines(&expected_str, &actual_str)
            .unified_diff()
            .header("fixture", "generated")
            .to_string();
        panic!(
            "Vendored {label} app-server schema fixture {} differs from generated output. \
Run `just write-app-server-schema` to overwrite with your changes.\n\n{diff}",
            path.display()
        );
    }

    Ok(())
}

fn schema_root() -> Result<PathBuf> {
    let typescript_index = codex_utils_cargo_bin::find_resource!("schema/typescript/index.ts")
        .context("resolve TypeScript schema index.ts")?;
    let schema_root = typescript_index
        .parent()
        .and_then(|p| p.parent())
        .context("derive schema root from schema/typescript/index.ts")?
        .to_path_buf();

    let json_bundle =
        codex_utils_cargo_bin::find_resource!("schema/json/codex_app_server_protocol.schemas.json")
            .context("resolve JSON schema bundle")?;
    let json_root = json_bundle
        .parent()
        .and_then(|p| p.parent())
        .context("derive schema root from schema/json/codex_app_server_protocol.schemas.json")?;
    anyhow::ensure!(
        schema_root == json_root,
        "schema roots disagree: typescript={} json={}",
        schema_root.display(),
        json_root.display()
    );

    Ok(schema_root)
}

fn read_tree(root: &Path, label: &str) -> Result<BTreeMap<PathBuf, Vec<u8>>> {
    read_schema_fixture_subtree(root, label).with_context(|| {
        format!(
            "read {label} schema fixture subtree from {}",
            root.display()
        )
    })
}
