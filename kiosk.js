// kiosk.js - 어린이 주문 키오스크 컨트롤러
(function() {
    // 사운드 합성을 위한 Web Audio Context
    let audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    // 아동용 맑은 실로폰 음색 재생
    function playTone(freq, type = 'sine', duration = 0.2, delay = 0) {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

            // 실로폰 느낌의 엔벨로프 (빠른 어택, 서서히 감쇠)
            gain.gain.setValueAtTime(0, ctx.currentTime + delay);
            gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + duration);
        } catch (e) {
            console.warn("Audio play blocked or unsupported:", e);
        }
    }

    // 알림음 종류들
    const sounds = {
        click: () => playTone(523.25, 'sine', 0.15), // 도 (짧게)
        addFlower: (count) => {
            // 꽃이 추가될 때 도-미-솔-도-미 단계별 음계 상승
            const scale = [261.63, 329.63, 392.00, 523.25, 659.25];
            const freq = scale[Math.min(count - 1, scale.length - 1)];
            playTone(freq, 'triangle', 0.25);
        },
        remove: () => playTone(196.00, 'sawtooth', 0.2), // 낮은 솔
        stepChange: () => {
            // 도-솔 맑은 2음
            playTone(392.00, 'sine', 0.1, 0);
            playTone(523.25, 'sine', 0.15, 0.08);
        },
        success: () => {
            // 도-미-솔-도 높은 멜로디 (도레미파솔 상승)
            const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
            notes.forEach((freq, idx) => {
                playTone(freq, 'sine', 0.25, idx * 0.1);
            });
        }
    };

    // 브로드캐스트 채널 생성 (에러 방지 안전 래핑)
    let orderChannel = null;
    try {
        orderChannel = new BroadcastChannel('flower_shop_orders');
    } catch (e) {
        console.warn("BroadcastChannel is blocked/not supported. Falling back to LocalStorage syncing.");
    }

    // 키오스크 앱 초기화 함수
    window.initKiosk = function(containerSelector = '#kiosk-view') {
        const root = document.querySelector(containerSelector);
        if (!root) return;

        // 키오스크 전용 상태 관리
        const state = {
            flowers: [], // { id, name, emoji, price } 최대 5송이
            wrapping: { id: 'none', name: '포장 없음', color: 'transparent', price: 0 },
            ribbon: { id: 'none', name: '리본 없음', color: 'transparent', price: 0 },
            currentStep: 1,
            maxFlowers: 5,
            orderId: parseInt(localStorage.getItem('kiosk_last_order_id') || '100'),
            totalPrice: 0
        };

        // DOM 요소 획득
        const bouquetCanvas = root.querySelector('#bouquet-canvas');
        const previewFlowers = root.querySelector('#preview-flowers');
        const previewWrapping = root.querySelector('#preview-wrapping');
        const previewRibbon = root.querySelector('#preview-ribbon');
        const currentFlowerCount = root.querySelector('#current-flower-count');
        const btnResetBouquet = root.querySelector('#btn-reset-bouquet');
        
        const stepTabs = root.querySelectorAll('.step-tab');
        const tabContents = root.querySelectorAll('.tab-content');
        
        const btnPrevStep = root.querySelector('#btn-prev-step');
        const btnNextStep = root.querySelector('#btn-next-step');
        const btnSubmitOrder = root.querySelector('#btn-submit-order');
        
        const selectItems = root.querySelectorAll('.select-item');
        const orderSuccessModal = root.querySelector('#order-success-modal');
        const successOrderId = root.querySelector('#success-order-id');
        const btnCloseModal = root.querySelector('#btn-close-modal');

        // 꽃다발 렌더링 로직
        function renderBouquet() {
            // 1. 포장지 렌더링
            previewWrapping.innerHTML = '';
            if (state.wrapping.id !== 'none') {
                const wrapShape = document.createElement('div');
                wrapShape.className = 'wrap-shape';
                wrapShape.style.backgroundColor = state.wrapping.color;
                // 포장 주름 모양 등을 표현하기 위한 이중 색감 효과
                wrapShape.style.border = `4px solid ${state.wrapping.color}`;
                wrapShape.style.boxShadow = `inset -15px -15px 0px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.1)`;
                previewWrapping.appendChild(wrapShape);
            }

            // 2. 꽃 렌더링 (줄기 포함)
            previewFlowers.innerHTML = '';
            if (state.flowers.length === 0) {
                previewFlowers.innerHTML = '<div class="empty-bouquet-text">꽃을 골라 담아보세요!</div>';
            } else {
                state.flowers.forEach((flower, index) => {
                    const slotClass = `flower-slot-${index + 1}`;
                    
                    // 꽃 노드 생성
                    const flowerNode = document.createElement('div');
                    flowerNode.className = `preview-flower-node ${slotClass}`;
                    
                    // 줄기(Stem) SVG 생성
                    const stemSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    stemSvg.setAttribute('style', 'position:absolute; top:70px; left:25px; width:40px; height:90px; overflow:visible; pointer-events:none; z-index:-1;');
                    
                    // 줄기 선 그리기 (꽃 종류별로 약간 다르게 휘도록)
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    const startX = 20;
                    const startY = 0;
                    // 모든 줄기가 하단 중앙(리본이 묶일 좌표)으로 모이도록 설정
                    // 슬롯별 꽃 위치에 따른 타겟 조정
                    let targetX = 20;
                    let controlX = 20;
                    if (index === 0) { targetX = 20; controlX = 20; } // 중앙
                    else if (index === 1) { targetX = 50; controlX = 35; } // 왼쪽 상단 -> 우하향
                    else if (index === 2) { targetX = -10; controlX = 5; } // 오른쪽 상단 -> 좌하향
                    else if (index === 3) { targetX = 70; controlX = 45; } // 극좌 -> 우하향
                    else if (index === 4) { targetX = -30; controlX = -5; } // 극우 -> 좌하향

                    path.setAttribute('d', `M ${startX} ${startY} Q ${controlX} 45, ${targetX} 90`);
                    path.setAttribute('stroke', '#7bb877'); // 싱그러운 초록색 줄기
                    path.setAttribute('stroke-width', '7');
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke-linecap', 'round');
                    
                    stemSvg.appendChild(path);
                    flowerNode.appendChild(stemSvg);

                    // 꽃 머리 (이모지 텍스트)
                    const flowerHead = document.createElement('span');
                    flowerHead.textContent = flower.emoji;
                    flowerHead.style.display = 'block';
                    flowerNode.appendChild(flowerHead);

                    previewFlowers.appendChild(flowerNode);
                });
            }

            // 3. 리본 렌더링
            previewRibbon.innerHTML = '';
            if (state.ribbon.id !== 'none') {
                const ribbonShape = document.createElement('div');
                ribbonShape.className = 'ribbon-shape';
                
                // SVG 리본 드로잉 (색상 채우기 지원)
                ribbonShape.innerHTML = `
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <!-- 왼쪽 리본 날개 -->
                        <path d="M 50 40 C 20 20, 10 50, 50 60 Z" fill="${state.ribbon.color}" stroke="#4a3b32" stroke-width="4"/>
                        <!-- 오른쪽 리본 날개 -->
                        <path d="M 50 40 C 80 20, 90 50, 50 60 Z" fill="${state.ribbon.color}" stroke="#4a3b32" stroke-width="4"/>
                        <!-- 아래로 흘러내리는 끈 -->
                        <path d="M 45 55 L 30 85 L 45 80 Z" fill="${state.ribbon.color}" stroke="#4a3b32" stroke-width="3"/>
                        <path d="M 55 55 L 70 85 L 55 80 Z" fill="${state.ribbon.color}" stroke="#4a3b32" stroke-width="3"/>
                        <!-- 중앙 매듭 -->
                        <circle cx="50" cy="50" r="12" fill="${state.ribbon.color}" stroke="#4a3b32" stroke-width="4"/>
                    </svg>
                `;
                previewRibbon.appendChild(ribbonShape);
            }

            // 4. 실시간 금액 합산 계산 및 렌더링
            const flowerSum = state.flowers.reduce((sum, f) => sum + f.price, 0);
            state.totalPrice = flowerSum + state.wrapping.price + state.ribbon.price;
            
            const totalPriceValue = root.querySelector('#total-price-value');
            if (totalPriceValue) {
                totalPriceValue.textContent = state.totalPrice.toLocaleString();
            }

            // 꽃 개수 배지 업데이트
            currentFlowerCount.textContent = state.flowers.length;
        }

        // 아이템 선택 처리
        function handleItemSelect(element) {
            const type = element.getAttribute('data-type');
            const id = element.getAttribute('data-id');
            const name = element.getAttribute('data-name');
            const color = element.getAttribute('data-color') || '';
            const emoji = element.getAttribute('data-emoji') || '';
            const price = parseInt(element.getAttribute('data-price') || '0');

            if (type === 'flower') {
                // 꽃은 누를 때마다 장바구니에 하나씩 추가 (최대 5송이)
                if (state.flowers.length >= state.maxFlowers) {
                    playTone(150, 'sawtooth', 0.2); // 삑- 실패음
                    alert("꽃은 5송이까지만 담을 수 있어요!");
                    return;
                }
                
                state.flowers.push({ id, name, emoji, price });
                sounds.addFlower(state.flowers.length);
                
                // 클릭 애니메이션 효과
                element.classList.add('pop-active');
                setTimeout(() => element.classList.remove('pop-active'), 200);

            } else if (type === 'wrapping') {
                // 포장지는 하나만 선택 가능
                root.querySelectorAll('.select-item[data-type="wrapping"]').forEach(item => {
                    item.classList.remove('active');
                });
                element.classList.add('active');
                state.wrapping = { id, name, color, price };
                sounds.click();

            } else if (type === 'ribbon') {
                // 리본도 하나만 선택 가능
                root.querySelectorAll('.select-item[data-type="ribbon"]').forEach(item => {
                    item.classList.remove('active');
                });
                element.classList.add('active');
                state.ribbon = { id, name, color, price };
                sounds.click();
            }

            renderBouquet();
        }

        // 탭 단계 전환 기능
        function setStep(stepNum) {
            state.currentStep = stepNum;
            
            // 탭 헤더 활성화 상태 변경
            stepTabs.forEach(tab => {
                const active = parseInt(tab.getAttribute('data-step')) === stepNum;
                tab.classList.toggle('active', active);
            });

            // 탭 본문 표시 상태 변경
            tabContents.forEach((content, index) => {
                const active = index + 1 === stepNum;
                content.classList.toggle('active', active);
            });

            // 하단 버튼 구성 변경
            if (stepNum === 1) {
                btnPrevStep.disabled = true;
                btnNextStep.classList.remove('hide');
                btnSubmitOrder.classList.add('hide');
            } else if (stepNum === 2) {
                btnPrevStep.disabled = false;
                btnNextStep.classList.remove('hide');
                btnSubmitOrder.classList.add('hide');
            } else if (stepNum === 3) {
                btnPrevStep.disabled = false;
                btnNextStep.classList.add('hide');
                btnSubmitOrder.classList.remove('hide');
            }

            sounds.stepChange();
        }

        // 꽃다발 초기화
        function resetBouquet() {
            state.flowers = [];
            state.wrapping = { id: 'none', name: '포장 없음', color: 'transparent', price: 0 };
            state.ribbon = { id: 'none', name: '리본 없음', color: 'transparent', price: 0 };
            state.totalPrice = 0;
            
            // UI 초기화
            root.querySelectorAll('.select-item[data-type="wrapping"]').forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-id') === 'none');
            });
            root.querySelectorAll('.select-item[data-type="ribbon"]').forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-id') === 'none');
            });

            setStep(1);
            renderBouquet();
            sounds.remove();
        }

        // 주문 제출
        function submitOrder() {
            if (state.flowers.length === 0) {
                playTone(150, 'sawtooth', 0.2);
                alert("주문하기 전에 꽃을 먼저 담아주세요! 🌹");
                return;
            }

            // 주문번호 발급 (100 ~ 999 순환)
            state.orderId = state.orderId >= 999 ? 100 : state.orderId + 1;
            localStorage.setItem('kiosk_last_order_id', state.orderId.toString());

            const orderData = {
                id: state.orderId,
                flowers: [...state.flowers],
                wrapping: { ...state.wrapping },
                ribbon: { ...state.ribbon },
                totalPrice: state.totalPrice,
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                status: 'waiting' // 'waiting', 'making', 'done'
            };

            // BroadcastChannel을 통해 전송 (안전 확인)
            if (orderChannel) {
                orderChannel.postMessage({
                    type: 'NEW_ORDER',
                    order: orderData
                });
            }

            // LocalStorage 백업 (동일 브라우저 내 통신 안정성용)
            const currentOrders = JSON.parse(localStorage.getItem('flower_shop_orders') || '[]');
            currentOrders.push(orderData);
            localStorage.setItem('flower_shop_orders', JSON.stringify(currentOrders));

            // 성공 멜로디 재생
            sounds.success();

            // 성공 팝업 띄우기
            successOrderId.textContent = state.orderId;
            const successOrderPrice = root.querySelector('#success-order-price');
            if (successOrderPrice) {
                successOrderPrice.textContent = state.totalPrice.toLocaleString();
            }
            orderSuccessModal.classList.add('active');

            // 꽃가루 파티클 생성
            createConfetti(root.querySelector('#confetti-container'));
        }

        // 꽃가루 날리기 애니메이션 효과
        function createConfetti(container) {
            if (!container) return;
            container.innerHTML = '';
            const colors = ['#ff85a1', '#ffd166', '#a0c4ff', '#c1f0c8', '#ff4d6d'];
            
            for (let i = 0; i < 40; i++) {
                const piece = document.createElement('div');
                piece.className = 'confetti-piece';
                piece.style.left = `${Math.random() * 100}%`;
                piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                piece.style.width = `${Math.random() * 12 + 6}px`;
                piece.style.height = piece.style.width;
                piece.style.animationDelay = `${Math.random() * 0.8}s`;
                piece.style.animationDuration = `${Math.random() * 1.5 + 1.5}s`;
                container.appendChild(piece);
            }
        }

        // ==========================================
        // 이벤트 바인딩
        // ==========================================

        // 아이템 클릭 이벤트
        selectItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // AudioContext 활성화 유도 (Chrome 정책 대응)
                getAudioContext();
                handleItemSelect(item);
            });
        });

        // 탭 헤더 클릭 이벤트
        stepTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetStep = parseInt(tab.getAttribute('data-step'));
                setStep(targetStep);
            });
        });

        // 이전/다음 단계 버튼
        btnPrevStep.addEventListener('click', () => {
            if (state.currentStep > 1) {
                setStep(state.currentStep - 1);
            }
        });

        btnNextStep.addEventListener('click', () => {
            if (state.currentStep < 3) {
                setStep(state.currentStep + 1);
            }
        });

        // 꽃다발 지우기 버튼
        btnResetBouquet.addEventListener('click', () => {
            resetBouquet();
        });

        // 주문 제출 버튼
        btnSubmitOrder.addEventListener('click', () => {
            submitOrder();
        });

        // 모달 닫기(새로 만들기) 버튼
        btnCloseModal.addEventListener('click', () => {
            orderSuccessModal.classList.remove('active');
            resetBouquet();
        });

        // 초기 화면 그리기
        resetBouquet();
    };

    // 만약 단독 탭 모드라면 바로 로드되도록 자동실행 설정
    if (window.location.search.includes('mode=kiosk')) {
        document.addEventListener('DOMContentLoaded', () => {
            window.initKiosk();
        });
    }
})();
