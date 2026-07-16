use anyhow::Context;
use anyhow::Result;
use codex_app_server_protocol::GenerateTsOptions;
use codex_app_server_protocol::generate_json_with_experimental;
use codex_app_server_protocol::generate_ts_with_options;
use codex_app_server_protocol::generate_typescript_schema_fixture_subtree_for_tests;
use codex_app_server_protocol::read_schema_fixture_subtree;
use pretty_assertions::assert_eq;
use serde_json::Value;
use serde_json::json;
use similar::TextDiff;
use std::collections::BTreeMap;
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
        r#"{method:"initialize";params:InitializeParams;response:InitializeResponse;}"#,
        r#"{method:"thread/projection/attach";params:ThreadProjectionAttachParams;response:ThreadProjectionAttachResponse;}"#,
        r#"{method:"turn/start";params:TurnStartParams;response:TurnStartResponse;}"#,
        r#"{method:"turn/interrupt";params:TurnInterruptParams;response:TurnInterruptResponse;}"#,
        r#"{method:"config/mcpServer/reload";params:undefined;response:McpServerRefreshResponse;}"#,
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
            run_prettier: false,
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

    assert_schema_trees_match(label, &fixture_tree, &generated_tree)?;

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

    // If the file sets match, diff contents for each file for a nicer error.
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
    // In Bazel runfiles (especially manifest-only mode), resolving directories is not
    // reliable. Resolve a known file, then walk up to the schema root.
    let typescript_index = codex_utils_cargo_bin::find_resource!("schema/typescript/index.ts")
        .context("resolve TypeScript schema index.ts")?;
    let schema_root = typescript_index
        .parent()
        .and_then(|p| p.parent())
        .context("derive schema root from schema/typescript/index.ts")?
        .to_path_buf();

    // Sanity check that the JSON fixtures resolve to the same schema root.
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
