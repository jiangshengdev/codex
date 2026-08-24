use std::path::PathBuf;

use serde::Deserialize;
use serde::Deserializer;
use serde::Serialize;
use serde::Serializer;

#[cfg(test)]
pub(crate) fn nullable_string_schema(
    generator: &mut schemars::r#gen::SchemaGenerator,
) -> schemars::schema::Schema {
    generator.subschema_for::<Option<String>>()
}

#[cfg(test)]
macro_rules! nullable_schema {
    ($name:ident, $ty:ty) => {
        pub(crate) fn $name(
            generator: &mut schemars::r#gen::SchemaGenerator,
        ) -> schemars::schema::Schema {
            generator.subschema_for::<Option<$ty>>()
        }
    };
}

#[cfg(test)]
nullable_schema!(
    nullable_active_permission_profile_schema,
    crate::protocol::v2::ActivePermissionProfile
);
#[cfg(test)]
nullable_schema!(nullable_account_schema, crate::protocol::v2::Account);
#[cfg(test)]
nullable_schema!(
    nullable_account_token_usage_daily_buckets_schema,
    Vec<crate::protocol::v2::AccountTokenUsageDailyBucket>
);
#[cfg(test)]
nullable_schema!(
    nullable_absolute_path_buf_schema,
    codex_utils_absolute_path::AbsolutePathBuf
);
#[cfg(test)]
nullable_schema!(nullable_bool_schema, bool);
#[cfg(test)]
nullable_schema!(
    nullable_config_requirements_schema,
    crate::protocol::v2::ConfigRequirements
);
#[cfg(test)]
nullable_schema!(
    nullable_overridden_metadata_schema,
    crate::protocol::v2::OverriddenMetadata
);
#[cfg(test)]
nullable_schema!(nullable_path_uri_schema, codex_utils_path_uri::PathUri);
#[cfg(test)]
nullable_schema!(
    nullable_rate_limit_reset_credits_summary_schema,
    crate::protocol::v2::RateLimitResetCreditsSummary
);
#[cfg(test)]
nullable_schema!(
    nullable_rate_limits_by_limit_id_schema,
    std::collections::HashMap<String, crate::protocol::v2::RateLimitSnapshot>
);
#[cfg(test)]
nullable_schema!(
    nullable_reasoning_effort_schema,
    codex_protocol::openai_models::ReasoningEffort
);
#[cfg(test)]
nullable_schema!(nullable_thread_goal_schema, crate::protocol::v2::ThreadGoal);
#[cfg(test)]
nullable_schema!(nullable_turns_page_schema, crate::protocol::v2::TurnsPage);

#[cfg(test)]
pub(crate) struct OptionalNonNullableSchema<T>(std::marker::PhantomData<T>);

#[cfg(test)]
pub(crate) type OptionalConfigLayersSchema =
    OptionalNonNullableSchema<Vec<crate::protocol::v2::ConfigLayer>>;

#[cfg(test)]
impl<T> schemars::JsonSchema for OptionalNonNullableSchema<T>
where
    T: schemars::JsonSchema,
{
    fn schema_name() -> String {
        format!("OptionalNonNullable_{}", T::schema_name())
    }

    fn json_schema(generator: &mut schemars::r#gen::SchemaGenerator) -> schemars::schema::Schema {
        generator.subschema_for::<T>()
    }

    fn is_referenceable() -> bool {
        false
    }

    fn _schemars_private_is_option() -> bool {
        true
    }
}

pub fn deserialize_empty_path_as_none<'de, D>(deserializer: D) -> Result<Option<PathBuf>, D::Error>
where
    D: Deserializer<'de>,
{
    let path = Option::<PathBuf>::deserialize(deserializer)?;
    Ok(path.filter(|path| !path.as_os_str().is_empty()))
}

pub fn deserialize_double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    serde_with::rust::double_option::deserialize(deserializer)
}

pub fn serialize_double_option<T, S>(
    value: &Option<Option<T>>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    T: Serialize,
    S: Serializer,
{
    serde_with::rust::double_option::serialize(value, serializer)
}
