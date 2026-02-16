# DEPLOY 운영 문서

기준 일자: 2026-02-16  
대상 리포: `https://github.com/leydian/WritingEditor`

## 1. 배포 방식

GitHub Pages (branch deploy)

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/(root)`

## 2. 기본 서비스 URL

- 기본 URL: `https://leydian.github.io/WritingEditor/`

## 3. 커스텀 도메인

- 한글 도메인: `창영소글쓰기.xyz`
- punycode: `xn--bj0bpd595digd6qbu0t.xyz`

## 4. DNS 설정 기준

`@` A 레코드:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

`www` CNAME:

- `leydian.github.io`

## 5. 점검 절차

1. GitHub Pages 설정이 `main /(root)`인지 확인
2. `CNAME` 파일이 의도된 도메인 값인지 확인
3. DNS A/CNAME 레코드가 정확한지 확인
4. Pages 상태에서 HTTPS 활성화 여부 확인
5. 브라우저에서 기본 URL + 커스텀 도메인 둘 다 접속 확인

## 6. 반영 지연 대응

도메인 검증 오류(`InvalidDNSError`)가 즉시 사라지지 않을 수 있다.  
DNS 전파/검증 반영은 수분~수시간, 길면 24~48시간까지 지연될 수 있다.

## 7. 배포 전 체크리스트

1. 주요 기능 수동 점검 완료(인증, 동기화, 히스토리, 모바일)
2. 콘솔 치명 오류 없음
3. `index.html`의 스크립트 버전(`app.js?v=56`) 확인
4. 필요한 문서(`SUPABASE.md`, 인수인계 문서) 최신화 확인

## 8. 롤백 절차(최소)

1. GitHub에서 직전 정상 커밋으로 `main` 복구
2. Pages 빌드 완료까지 대기
3. 기본 URL/커스텀 도메인 재점검

## 9. 운영자 메모

커스텀 도메인 최종 확정 후 Supabase Auth의 `Site URL` 및 `Redirect URLs`도 같은 도메인 정책으로 동기화해야 한다.
