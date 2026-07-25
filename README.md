# MDproViewer

Markdown / PDF / PPTX 등을 브라우저에서 보는 뷰어입니다.  
로컬에서 바로 실행하거나, Vercel 같은 정적 호스팅에 배포할 수 있습니다.

---

## 사전 준비: Node.js 설치

이 프로젝트는 **Node.js**가 필요합니다. (npm이 함께 설치됩니다.)

1. [Node.js LTS](https://nodejs.org/) 다운로드 페이지에서 LTS 버전을 설치하세요.
2. 설치 후 터미널에서 아래처럼 버전이 나오면 성공입니다.

```bash
node -v
npm -v
```

> Windows에서 더 편하게 쓰려면, 아래 **`run.bat`** 을 더블클릭해도 됩니다.  
> Node.js가 없으면 자동으로 설치를 시도한 뒤 `npm run preview`까지 실행합니다.

---

## 의존성 설치

프로젝트 폴더에서 **한 번** 실행하세요.

```bash
npm i
```

(`npm install` 과 동일합니다.)  
`node_modules` 폴더가 생기고, Vite·Tailwind 등 필요한 패키지가 설치됩니다.

---

## 서버 실행 방법

### `npm run dev` vs `npm run preview`

| 명령어 | 하는 일 | 언제 쓰나요? |
|--------|---------|--------------|
| **`npm run dev`** | Vite **개발 서버**를 켭니다. 파일을 수정하면 거의 바로 반영됩니다. (기본 포트 **5173**) | 코드를 고치면서 개발할 때 |
| **`npm run preview`** | 먼저 **`vite build`**로 `dist`를 만든 뒤, 그 결과물을 **미리보기 서버**로 띄웁니다. (기본 포트 **4173**) | 배포에 가까운 상태로 확인할 때 |

```bash
# 개발용 (핫 리로드)
npm run dev

# 빌드 후 미리보기 (배포와 비슷한 환경)
npm run preview
```

브라우저가 자동으로 열리지 않으면 터미널에 표시된 주소(예: `http://localhost:5173`)로 접속하세요.

---

### `run.py` 사용법

Python으로 `dist` 폴더를 **정적 HTTP 서버**로 띄웁니다. (포트 **8080**)

```bash
python run.py
```

동작 요약:

1. **`dist` 폴더가 없으면** 자동으로 `npm install` → `npm run build`를 실행합니다.
2. `dist`를 serve하고, 브라우저를 `http://localhost:8080` 으로 엽니다.
3. 종료는 **Ctrl+C** 입니다.

> Node/Vite 미리보기 대신, 단순 정적 서버로 확인하고 싶을 때 유용합니다.  
> AI 사이드바 등 일부 기능은 `file://` 이 아니라 HTTP로 열어야 정상 동작합니다.

Python이 없다면 [python.org](https://www.python.org/downloads/) 에서 설치하거나, 대신 `npm run preview` / `run.bat`을 사용하세요.

---

### Windows: `run.bat` (간편 실행)

프로젝트 루트의 **`run.bat`** 을 더블클릭하세요.

1. Node.js가 없으면 **winget**으로 Node.js LTS 설치를 시도합니다.
2. `node_modules`가 없으면 `npm install`을 실행합니다.
3. **`npm run preview`** 로 빌드 + 미리보기 서버를 켭니다.

관리자 권한이 필요하거나 winget이 없으면, Node.js를 수동 설치한 뒤 다시 `run.bat`을 실행하세요.

---

## Vercel 등에 배포할 때

이 앱은 Vite가 **`dist`** 에 정적 파일을 만듭니다.  
정적 사이트 호스팅(Vercel, Netlify, Cloudflare Pages 등)에서는 보통 아래처럼 설정합니다.

| 항목 | 값 |
|------|-----|
| **Install Command** | `npm install` (또는 `npm i`) |
| **Build Command** | `npm run build` |
| **Output / Publish / Serve 폴더** | **`dist`** |

### Vercel 예시

- Framework Preset: **Vite** (또는 Other)
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

배포 후 브라우저에서 사이트 URL로 접속하면 됩니다.

> `dist`는 빌드 산출물이라 Git에 올리지 않아도 됩니다. (`.gitignore`에 포함되어 있습니다.)  
> 호스팅이 빌드할 때 자동으로 생성합니다.

로컬에서 배포용 결과만 확인하려면:

```bash
npm run build
```

이후 `dist` 폴더 내용이 실제 배포되는 파일들입니다.

---

## 빠른 요약

### Node.js 설치 후 의존성 설치

```bash
npm i
```

### 개발 서버

```bash
npm run dev
```

### 배포에 가까운 미리보기

```bash
npm run preview
```

### Python 정적 서버 (dist)

```bash
python run.py
```

### Windows 원클릭

```bash
run.bat
```

### 배포 설정

Build = `npm run build`, Serve 폴더 = `dist`
