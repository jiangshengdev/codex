use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::TryRngCore;
use rand::rngs::OsRng;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchToken(String);

impl LaunchToken {
    pub fn generate() -> std::io::Result<Self> {
        let mut bytes = [0_u8; 32];
        OsRng
            .try_fill_bytes(&mut bytes)
            .map_err(std::io::Error::other)?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[cfg(test)]
    pub fn from_test_value(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn requires_io_result(_: std::io::Result<LaunchToken>) {}

    #[test]
    fn generated_token_is_url_safe_and_has_entropy_length() {
        let token = LaunchToken::generate().expect("token should generate");

        assert!(token.as_str().len() >= 22);
        assert!(
            token
                .as_str()
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        );
    }

    #[test]
    fn generate_returns_io_result() {
        requires_io_result(LaunchToken::generate());
    }
}
