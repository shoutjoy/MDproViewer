use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeepseekRequest {
    base_url: String,
    path: String,
    api_key: String,
    body: Option<Value>,
    timeout_seconds: Option<u64>,
}

#[derive(Serialize)]
struct DeepseekResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn deepseek_api_request(request: DeepseekRequest) -> Result<DeepseekResponse, String> {
    let base = request.base_url.trim_end_matches('/');
    if base != "https://api.deepseek.com" || !matches!(request.path.as_str(), "/chat/completions" | "/models" | "/user/balance") {
        return Err("Only the official DeepSeek API endpoints are allowed".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(request.timeout_seconds.unwrap_or(300).clamp(30, 3600)))
        .build().map_err(|error| error.to_string())?;
    let builder = if let Some(body) = request.body {
        client.post(format!("{}{}", base, request.path)).json(&body)
    } else {
        client.get(format!("{}{}", base, request.path))
    };
    let response = builder.bearer_auth(request.api_key).send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| error.to_string())?;
    Ok(DeepseekResponse { status, body })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![deepseek_api_request])
        .run(tauri::generate_context!())
        .expect("error while running MDpro Viewer");
}
