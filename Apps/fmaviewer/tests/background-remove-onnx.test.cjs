const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "js", "image", "backgroundRemove.js");
const source = fs.readFileSync(sourcePath, "utf8");

assert.match(
    source,
    /dom\.btnRunBgRemove\.disabled = onnxProcessing/,
    "ONNX 실행 중에는 지원되지 않는 중간 정지 버튼을 비활성화해야 합니다."
);
assert.match(
    source,
    /ONNX 계산이 진행 중입니다/,
    "중복 실행 요청에는 현재 ONNX 처리가 진행 중임을 안내해야 합니다."
);
assert.match(
    source,
    /updateBgRemoveStageProgress\(\s*info,\s*78,\s*82/,
    "모델 준비 진행률은 전체 처리 구간에 맞게 변환해야 합니다."
);
assert.match(
    source,
    /updateBgRemoveStageProgress\(\s*info,\s*82,\s*94/,
    "ONNX 추론 진행률은 모델 준비 이후 구간에 맞게 변환해야 합니다."
);
assert.doesNotMatch(
    source,
    /\?\s*"■ ONNX 처리 정지"/,
    "ONNX Runtime이 지원하지 않는 중간 정지 UI를 다시 노출하면 안 됩니다."
);
assert.match(source, /bypassSessionCache:\s*false/, "준비한 ONNX 세션 캐시를 재사용해야 합니다.");
assert.match(source, /bypassModelCache:\s*false/, "검증한 ONNX 모델 캐시를 재사용해야 합니다.");
assert.doesNotMatch(source, /bypass(?:Session|Model)Cache:\s*true/, "ONNX 캐시를 매번 강제로 우회하면 안 됩니다.");
assert.match(source, /이미 준비된 ONNX 모델을 재사용합니다/, "동일 모델 재선택 시 기존 세션을 재사용해야 합니다.");
assert.match(
    source,
    /clearBackgroundModelRuntimeCache\(module, clearModelCache\)/,
    "일반 세션 오류에서는 검증 완료된 176MB 모델 캐시를 지우면 안 됩니다."
);
assert.match(
    source,
    /clearBackgroundModelRuntimeCache\(currentModule, true\)/,
    "다른 모델을 선택한 경우에만 이전 모델 캐시를 제거해야 합니다."
);

const progressDom = {
    bgRemoveProgressBar: { style: {} },
    bgRemovePercent: { innerText: "" },
    bgRemoveStatus: { innerText: "" }
};
const context = vm.createContext({
    console,
    dom: progressDom,
    document: { addEventListener() {} }
});
vm.runInContext(source, context, { filename: sourcePath });

context.updateBgRemoveStageProgress(
    { step: "processing", progress: 0 },
    82,
    94,
    "ONNX 전경과 배경 분리 중"
);
assert.equal(progressDom.bgRemovePercent.innerText, "82%", "추론 시작 시 진행률이 0%로 되돌아가면 안 됩니다.");
assert.equal(progressDom.bgRemoveStatus.innerText, "ONNX 전경과 배경 분리 중");

context.updateBgRemoveStageProgress(
    { step: "complete", progress: 100 },
    82,
    94,
    "ONNX 전경과 배경 분리 중"
);
assert.equal(progressDom.bgRemovePercent.innerText, "94%", "ONNX 단계 완료 진행률을 전체 작업 구간에 맞춰야 합니다.");

console.log("background-remove ONNX regression checks passed");
