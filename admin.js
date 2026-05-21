// admin.js - 선생님 매장 관리자 화면 컨트롤러
(function() {
    let audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    // 맑은 벨 소리 효과음 합성 (딩-동)
    function playDingDong() {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            
            // '딩' 소리
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // 미
            gain1.gain.setValueAtTime(0, ctx.currentTime);
            gain1.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
            gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.4);

            // '동' 소리
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.25); // 도
            gain2.gain.setValueAtTime(0, ctx.currentTime + 0.25);
            gain2.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.27);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.25);
            osc2.stop(ctx.currentTime + 0.7);
        } catch (e) {
            console.warn("Audio play blocked or unsupported:", e);
        }
    }

    // 단순 완료 버튼음
    function playClick() {
        try {
            const ctx = getAudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(392.00, ctx.currentTime); // 솔
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch(e) {}
    }

    let orderChannel = null;
    try {
        orderChannel = new BroadcastChannel('flower_shop_orders');
    } catch (e) {
        console.warn("BroadcastChannel is not supported/allowed in this context. Falling back to LocalStorage polling.");
    }

    window.initAdmin = function(containerSelector = '#admin-view') {
        const root = document.querySelector(containerSelector);
        if (!root) return;

        // 관리자 주문 상태 데이터
        let orders = [];
        let stats = {
            totalOrders: 0,
            completedOrders: 0,
            totalSales: 0,
            flowers: {
                rose: 0,
                tulip: 0,
                sunflower: 0,
                daisy: 0,
                carnation: 0
            }
        };

        // DOM 요소 캐시
        const ordersList = root.querySelector('#orders-list');
        const emptyOrdersMsg = root.querySelector('#empty-orders-msg');
        const waitingCount = root.querySelector('#waiting-count');
        const statTotalOrders = root.querySelector('#stat-total-orders');
        const statCompletedOrders = root.querySelector('#stat-completed-orders');
        const statTotalSales = root.querySelector('#stat-total-sales');
        const flowerPopularityList = root.querySelector('#flower-popularity-list');
        const btnResetAll = root.querySelector('#btn-reset-all');

        // 로컬스토리지에서 기존 상태 복구
        function loadSavedState() {
            orders = JSON.parse(localStorage.getItem('flower_shop_orders') || '[]');
            stats = JSON.parse(localStorage.getItem('flower_shop_stats') || JSON.stringify(stats));
            updateUI();
        }

        // 상태를 로컬스토리지에 저장
        function saveState() {
            localStorage.setItem('flower_shop_orders', JSON.stringify(orders));
            localStorage.setItem('flower_shop_stats', JSON.stringify(stats));
        }

        // 전체 주문 및 통계 초기화
        function resetAll() {
            if (confirm("정말로 모든 주문 내역과 매출 및 인기도 통계를 다 지울까요?")) {
                orders = [];
                stats = {
                    totalOrders: 0,
                    completedOrders: 0,
                    totalSales: 0,
                    flowers: { rose: 0, tulip: 0, sunflower: 0, daisy: 0, carnation: 0 }
                };
                saveState();
                updateUI();
                playClick();
            }
        }

        // 새로운 주문 추가
        function addOrder(orderData) {
            // 중복 주문 방지 체크
            if (orders.find(o => o.id === orderData.id)) return;

            orders.push(orderData);
            stats.totalOrders += 1;
            
            // 꽃 인기도 누적
            orderData.flowers.forEach(flower => {
                if (stats.flowers[flower.id] !== undefined) {
                    stats.flowers[flower.id] += 1;
                }
            });

            saveState();
            updateUI();
            
            // 주문 알림 '딩동' 사운드
            playDingDong();
        }

        // 주문 상태 변경 (waiting -> making -> done -> 삭제)
        function changeOrderStatus(orderId, currentStatus) {
            const orderIndex = orders.findIndex(o => o.id === orderId);
            if (orderIndex === -1) return;

            if (currentStatus === 'waiting') {
                orders[orderIndex].status = 'making';
                playClick();
            } else if (currentStatus === 'making') {
                orders[orderIndex].status = 'done';
                stats.completedOrders += 1;
                // 제작 완료 시 매출액 누적
                stats.totalSales += (orders[orderIndex].totalPrice || 0);
                playDingDong(); // 완성 알림
            } else if (currentStatus === 'done') {
                // 완료 후 전달 완료되면 대기열 리스트에서 삭제
                orders.splice(orderIndex, 1);
                playClick();
            }

            saveState();
            updateUI();
        }

        // 꽃 아이디에 따른 한글명 매핑용 이모지
        const flowerEmojis = {
            rose: '🌹',
            tulip: '🌷',
            sunflower: '🌻',
            daisy: '🌼',
            carnation: '🌺'
        };

        // UI 전체 렌더링 및 갱신
        function updateUI() {
            // 1. 주문 카운트 업데이트
            const activeWaitingCount = orders.filter(o => o.status !== 'done').length;
            waitingCount.textContent = activeWaitingCount;
            
            statTotalOrders.textContent = stats.totalOrders;
            statCompletedOrders.textContent = stats.completedOrders;
            if (statTotalSales) {
                statTotalSales.textContent = `${stats.totalSales.toLocaleString()}원`;
            }

            // 2. 주문 대기열 리스트 그리기
            ordersList.innerHTML = '';
            
            if (orders.length === 0) {
                ordersList.appendChild(emptyOrdersMsg);
                emptyOrdersMsg.style.display = 'block';
            } else {
                emptyOrdersMsg.style.display = 'none';

                orders.forEach(order => {
                    const card = document.createElement('div');
                    card.className = `order-card status-${order.status}`;
                    
                    // 주문 꽃 품목 집계 (예: 빨간 장미 x 2, 해바라기 x 1)
                    const flowerCounts = {};
                    order.flowers.forEach(f => {
                        flowerCounts[f.id] = (flowerCounts[f.id] || 0) + 1;
                    });

                    // 조립 명세 HTML 생성
                    let visualSpecHtml = '';
                    for (const [flowerId, count] of Object.entries(flowerCounts)) {
                        visualSpecHtml += `
                            <div class="order-visual-spec">
                                <span class="spec-flower">${flowerEmojis[flowerId]}</span>
                                <span class="badge btn-sm" style="padding: 2px 6px; font-size: 14px;">${count}송이</span>
                            </div>
                        `;
                    }

                    // 포장/리본 태그
                    const wrappingTag = order.wrapping.id !== 'none' 
                        ? `<span class="meta-tag wrap">🎁 포장: ${order.wrapping.name}</span>`
                        : '';
                    const ribbonTag = order.ribbon.id !== 'none'
                        ? `<span class="meta-tag ribbon">🎀 리본: ${order.ribbon.name}</span>`
                        : '';

                    // 가격 태그
                    const priceBadgeHtml = `
                        <div class="order-card-price" style="margin-bottom: 5px; font-size:18px;">
                            💵 ${order.totalPrice ? order.totalPrice.toLocaleString() : 0}원
                        </div>
                    `;

                    // 상태 버튼 설정
                    let actionBtnHtml = '';
                    if (order.status === 'waiting') {
                        actionBtnHtml = `<button class="btn btn-secondary btn-sm btn-action" data-id="${order.id}" data-status="waiting">만들기 시작 🎀</button>`;
                    } else if (order.status === 'making') {
                        actionBtnHtml = `<button class="btn btn-primary btn-sm btn-action" data-id="${order.id}" data-status="making">다 만들었어요! 🎁</button>`;
                    } else if (order.status === 'done') {
                        actionBtnHtml = `<button class="btn btn-dark btn-sm btn-action" data-id="${order.id}" data-status="done">아이에게 전달 완료 ✔️</button>`;
                    }

                    card.innerHTML = `
                        <div class="order-badge-number">${order.id}</div>
                        <div class="order-detail-info">
                            <span class="order-time">주문 시간: ${order.timestamp}</span>
                            <div class="order-meta-labels">
                                ${visualSpecHtml}
                                ${wrappingTag}
                                ${ribbonTag}
                            </div>
                        </div>
                        <div class="order-actions">
                            ${priceBadgeHtml}
                            ${actionBtnHtml}
                        </div>
                    `;

                    ordersList.appendChild(card);
                });

                // 액션 버튼 이벤트 바인딩
                ordersList.querySelectorAll('.btn-action').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        getAudioContext(); // 브라우저 사운드 락 해제
                        const id = parseInt(btn.getAttribute('data-id'));
                        const status = btn.getAttribute('data-status');
                        changeOrderStatus(id, status);
                    });
                });
            }

            // 3. 꽃 인기도 차트 업데이트
            flowerPopularityList.innerHTML = `
                <div class="pop-item">🌹 빨간 장미: <span class="pop-count">${stats.flowers.rose}송이</span></div>
                <div class="pop-item">🌷 노란 튤립: <span class="pop-count">${stats.flowers.tulip}송이</span></div>
                <div class="pop-item">🌻 해바라기: <span class="pop-count">${stats.flowers.sunflower}송이</span></div>
                <div class="pop-item">🌼 하얀 데이지: <span class="pop-count">${stats.flowers.daisy}송이</span></div>
                <div class="pop-item">🌺 분홍 카네이션: <span class="pop-count">${stats.flowers.carnation}송이</span></div>
            `;
        }

        // ==========================================
        // 채널 메시지 수신 리스너 (허용된 경우)
        // ==========================================
        if (orderChannel) {
            orderChannel.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'NEW_ORDER') {
                    addOrder(event.data.order);
                }
            });
        }

        // 타 창/탭에서 변경 감지 시 새로고침
        window.addEventListener('storage', (e) => {
            if (e.key === 'flower_shop_orders' || e.key === 'flower_shop_stats') {
                loadSavedState();
            }
        });

        // 1초 주기 강제 동기화 폴러 (동일 탭 분할 뷰 및 file:// 프로토콜용 완벽 대응)
        const syncIntervalId = setInterval(() => {
            const savedOrders = JSON.parse(localStorage.getItem('flower_shop_orders') || '[]');
            const savedStats = JSON.parse(localStorage.getItem('flower_shop_stats') || JSON.stringify(stats));
            
            let hasChanges = false;
            
            // 1. 주문 개수나 내용물 상태가 달라졌는지 검사
            if (savedOrders.length !== orders.length) {
                // 신규 추가 시 효과음 발생 (초기 로딩 시 제외)
                if (savedOrders.length > orders.length && orders.length > 0) {
                    playDingDong();
                }
                orders = savedOrders;
                hasChanges = true;
            } else {
                for (let i = 0; i < orders.length; i++) {
                    if (savedOrders[i] && orders[i].status !== savedOrders[i].status) {
                        orders = savedOrders;
                        hasChanges = true;
                        break;
                    }
                }
            }
            
            // 2. 누적 매출 등 통계가 달라졌는지 검사
            if (savedStats.totalOrders !== stats.totalOrders || 
                savedStats.completedOrders !== stats.completedOrders || 
                savedStats.totalSales !== stats.totalSales) {
                stats = savedStats;
                hasChanges = true;
            }
            
            if (hasChanges) {
                updateUI();
            }
        }, 1000);

        // 메모리 누수 방지용 타이머 등록
        root.dataset.syncIntervalId = syncIntervalId;

        btnResetAll.addEventListener('click', resetAll);

        // 초기 상태 로드
        loadSavedState();
    };

    // 단독 탭 모드로 로드된 경우 자동 초기화
    if (window.location.search.includes('mode=admin')) {
        document.addEventListener('DOMContentLoaded', () => {
            window.initAdmin();
        });
    }
})();
