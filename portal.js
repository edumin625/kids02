// portal.js - 전체 뷰 관리 및 라우팅 로직
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    const portalView = document.getElementById('portal-view');
    const kioskView = document.getElementById('kiosk-view');
    const adminView = document.getElementById('admin-view');
    const splitView = document.getElementById('split-view');

    // 1. URL 모드에 따른 화면 노출
    function initView() {
        // 모든 뷰 비활성화
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        if (mode === 'kiosk') {
            kioskView.classList.add('active');
            // 키오스크 전용 초기화
            if (window.initKiosk) window.initKiosk();
        } else if (mode === 'admin') {
            adminView.classList.add('active');
            // 관리자 전용 초기화
            if (window.initAdmin) window.initAdmin();
        } else if (mode === 'split') {
            // 화면 분할 모드: Kiosk와 Admin을 Split 레이아웃 내에 직접 복제/배치
            splitView.classList.add('active');
            setupSplitScreen();
        } else {
            // 기본 포털 모드
            portalView.classList.add('active');
        }
    }

    // 2. 분할 화면 설정 (하나의 탭에서 둘 다 보기)
    function setupSplitScreen() {
        const leftPane = document.getElementById('split-kiosk-container');
        const rightPane = document.getElementById('split-admin-container');

        // 기존 템플릿의 내용을 복사해서 각각의 Pane에 담기
        const kioskClone = kioskView.cloneNode(true);
        const adminClone = adminView.cloneNode(true);

        kioskClone.id = 'kiosk-view-split';
        adminClone.id = 'admin-view-split';
        kioskClone.style.display = 'block';
        adminClone.style.display = 'block';
        kioskClone.classList.add('active');
        adminClone.classList.add('active');

        // 기존 콘텐츠 클리어 후 추가
        leftPane.innerHTML = '<div class="split-header-tag">👧 어린이 주문 화면 (Kiosk)</div>';
        rightPane.innerHTML = '<div class="split-header-tag">🏪 선생님 관리자 화면 (Admin)</div>';
        
        leftPane.appendChild(kioskClone);
        rightPane.appendChild(adminClone);

        // 복제된 컨텐츠에 각각 JS 초기화 적용
        if (window.initKiosk) {
            window.initKiosk('#kiosk-view-split');
        }
        if (window.initAdmin) {
            window.initAdmin('#admin-view-split');
        }
    }

    // 3. 포털 이벤트 바인딩
    const btnOpenKiosk = document.getElementById('btn-open-kiosk');
    const btnOpenAdmin = document.getElementById('btn-open-admin');
    const btnOpenSplit = document.getElementById('btn-open-split');
    const btnExitSplit = document.getElementById('btn-exit-split');

    if (btnOpenKiosk) {
        btnOpenKiosk.addEventListener('click', () => {
            const currentUrl = window.location.href.split('?')[0];
            window.open(`${currentUrl}?mode=kiosk`, 'KioskWindow', 'width=1024,height=800,location=no,status=no');
        });
    }

    if (btnOpenAdmin) {
        btnOpenAdmin.addEventListener('click', () => {
            const currentUrl = window.location.href.split('?')[0];
            window.open(`${currentUrl}?mode=admin`, 'AdminWindow', 'width=1200,height=850,location=no,status=no');
        });
    }

    if (btnOpenSplit) {
        btnOpenSplit.addEventListener('click', () => {
            const currentUrl = window.location.href.split('?')[0];
            window.location.href = `${currentUrl}?mode=split`;
        });
    }

    if (btnExitSplit) {
        btnExitSplit.addEventListener('click', () => {
            const currentUrl = window.location.href.split('?')[0];
            window.location.href = currentUrl;
        });
    }

    initView();
});
