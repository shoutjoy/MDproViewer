# FMA Viewer Git 일반 폴더 전환 기록

## 처리 날짜

- 2026-07-29

## 문제 원인

`Apps/fmaviewer`는 실제 앱 파일이 들어 있는 폴더였지만, 부모 저장소
`MDproViewer`에서는 일반 디렉터리가 아닌 Git 링크(`160000` 모드)로
등록되어 있었습니다.

기존 Git 링크가 가리키던 커밋은 다음과 같습니다.

```text
37abba918692694007931a0823186d0427d9cf38
```

부모 저장소에는 서브모듈 위치와 원격 저장소를 정의하는 `.gitmodules`
파일도 없었습니다. 이 때문에 Vercel이 부모 저장소를 체크아웃할 때
`Apps/fmaviewer/index.html`과 관련 CSS/JavaScript 파일을 가져오지 못했고,
FMA Viewer iframe에서 `404: NOT_FOUND`가 발생했습니다.

## 수행한 작업

1. `fmaviewer` 내부의 수정된 앱 파일을 그대로 보존했습니다.
2. `Apps/fmaviewer/.git` 중첩 저장소 메타데이터를 별도 위치에 백업했습니다.
3. 부모 저장소의 Git 링크를 인덱스에서 제거했습니다.
4. `Apps/fmaviewer`의 HTML, CSS, JavaScript 및 문서 파일을 부모 저장소가
   직접 추적하도록 일반 폴더로 등록했습니다.
5. 이 처리 기록 문서를 `Apps/fmaviewer/GIT_CONVERSION.md`에 추가했습니다.

전환 당시 보존된 로컬 수정 파일은 다음과 같습니다.

```text
css/styles.css
index.html
js/app.js
js/fileHandlers.js
js/globals.js
js/preview.js
```

## 중첩 Git 메타데이터 백업

기존 `Apps/fmaviewer/.git` 디렉터리는 삭제하지 않고 다음 위치로
이동했습니다.

```text
C:\Tmp\fmaviewer-git-backup-20260729
```

이 백업에는 기존 독립 저장소 `shoutjoy/fmaviewer`의 Git 이력과 설정이
들어 있습니다. 부모 저장소에서 일반 폴더 방식으로 계속 운영한다면
배포에는 이 백업이 필요하지 않습니다.

## 배포 반영 방법

현재 변경사항을 Vercel 배포에 반영하려면 부모 저장소에서 변경 내용을
검토한 뒤 커밋하고 원격 `main` 브랜치에 푸시해야 합니다.

커밋에는 기존 Git 링크 삭제와 `Apps/fmaviewer` 내부 실제 파일 추가가
함께 포함되어야 합니다.

배포 후 다음 URL이 HTTP 200으로 열리는지 확인합니다.

```text
/Apps/fmaviewer/index.html
```

## 독립 저장소 방식으로 되돌리는 경우

되돌리기 전에 부모 저장소의 현재 변경사항을 커밋하거나 별도로
백업해야 합니다. 그다음 일반 폴더 추적을 제거하고, 백업해 둔 Git
메타데이터를 다시 `Apps/fmaviewer/.git`으로 옮겨야 합니다.

서브모듈 방식으로 운영하려면 단순히 `.git` 디렉터리만 복원하는 대신
부모 저장소에 올바른 `.gitmodules`를 추가하고 Vercel이 해당 원격
저장소에 접근할 수 있도록 구성하는 것이 필요합니다.
