// Release builds are Windows GUI applications; do not allocate a console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use tauri::Emitter;

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LmStudioRequest {
    url: String,
    method: String,
    authorization: Option<String>,
    content_type: Option<String>,
    accept: Option<String>,
    body: Option<String>,
    timeout_seconds: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LmStudioResponse {
    status: u16,
    body: String,
    content_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InitialFilePayload {
    path: String,
    text: String,
    file_name: String,
    size_bytes: u64,
    modified_at: Option<u64>,
}

#[tauri::command]
fn get_initial_file() -> Result<Option<InitialFilePayload>, String> {
    let path = std::env::args_os()
        .skip(1)
        .map(std::path::PathBuf::from)
        .find(|candidate| candidate.is_file());
    let Some(path) = path else {
        return Ok(None);
    };

    read_document_file(&path).map(Some)
}

fn read_document_file(path: &Path) -> Result<InitialFilePayload, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "md" | "markdown" | "mdown" | "txt" | "csv" | "html" | "htm"
    ) {
        return Err("지원하는 텍스트 문서: md, markdown, mdown, txt, csv, html, htm".into());
    }

    let bytes = std::fs::read(&path).map_err(|error| format!("{}: {}", path.display(), error))?;
    let metadata =
        std::fs::metadata(&path).map_err(|error| format!("{}: {}", path.display(), error))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64);

    Ok(InitialFilePayload {
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_else(|| Path::new("document.md").to_str().unwrap())
            .to_string(),
        path: path.to_string_lossy().into_owned(),
        text: String::from_utf8_lossy(&bytes).into_owned(),
        size_bytes: metadata.len(),
        modified_at,
    })
}

#[tauri::command]
async fn deepseek_api_request(request: DeepseekRequest) -> Result<DeepseekResponse, String> {
    let base = request.base_url.trim_end_matches('/');
    if base != "https://api.deepseek.com"
        || !matches!(
            request.path.as_str(),
            "/chat/completions" | "/models" | "/user/balance"
        )
    {
        return Err("Only the official DeepSeek API endpoints are allowed".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(
            request.timeout_seconds.unwrap_or(300).clamp(30, 3600),
        ))
        .build()
        .map_err(|error| error.to_string())?;
    let builder = if let Some(body) = request.body {
        client.post(format!("{}{}", base, request.path)).json(&body)
    } else {
        client.get(format!("{}{}", base, request.path))
    };
    let response = builder
        .bearer_auth(request.api_key)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| error.to_string())?;
    Ok(DeepseekResponse { status, body })
}

#[tauri::command]
async fn lmstudio_api_request(request: LmStudioRequest) -> Result<LmStudioResponse, String> {
    let target = reqwest::Url::parse(request.url.trim()).map_err(|error| error.to_string())?;
    let host = target.host_str().unwrap_or_default();
    if target.scheme() != "http" || !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        return Err("Only a local LM Studio HTTP address is allowed".into());
    }
    if !matches!(
        target.path(),
        "/v1/models"
            | "/api/v1/models"
            | "/api/v1/models/load"
            | "/v1/chat/completions"
            | "/api/v1/chat"
    ) {
        return Err("Unsupported LM Studio API endpoint".into());
    }
    let method = request.method.trim().to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST") {
        return Err("Unsupported LM Studio HTTP method".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(
            request.timeout_seconds.unwrap_or(300).clamp(5, 3600),
        ))
        .build()
        .map_err(|error| error.to_string())?;
    let mut builder = if method == "POST" {
        client.post(target)
    } else {
        client.get(target)
    };
    builder = builder
        .header(
            "Accept",
            request.accept.as_deref().unwrap_or("application/json"),
        )
        .header(
            "Content-Type",
            request
                .content_type
                .as_deref()
                .unwrap_or("application/json"),
        );
    if let Some(value) = request
        .authorization
        .filter(|value| !value.trim().is_empty())
    {
        builder = builder.header("Authorization", value);
    }
    if method == "POST" {
        builder = builder.body(request.body.unwrap_or_default());
    }
    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let body = response.text().await.map_err(|error| error.to_string())?;
    Ok(LmStudioResponse {
        status,
        body,
        content_type,
    })
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                if let Some(path) = paths.first() {
                    match read_document_file(path) {
                        Ok(payload) => {
                            let _ = window.emit("mdpro-open-file", payload);
                        }
                        Err(error) => {
                            let _ = window.emit("mdpro-open-file-error", error);
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            deepseek_api_request,
            lmstudio_api_request,
            get_initial_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MDpro Viewer");
}
