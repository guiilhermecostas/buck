document.addEventListener('DOMContentLoaded', () => {
    const charityItems = document.querySelectorAll('.charity-item');
    const totalElement = document.querySelector('.summary-item:last-child span:last-child');
    const contributionElement = document.querySelector('.summary-item:first-child span:last-child');
    const contributionInput = document.getElementById('contribution-input');
    const errorMessage = document.getElementById('error-message');
    const maxErrorMessage = document.getElementById('max-error-message');
    const contributeButton = document.querySelector('.contribute-button');

    const MIN_CONTRIBUTION = 20;
    const MAX_CONTRIBUTION = 700;
    const REQUEST_COOLDOWN = 3000;
    let orderBumpsTotal = 0;
    let contributionValue = 0;
    let lastClickTime = 0;
    let isProcessing = false;

    function formatCurrency(value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function getTrackingParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            src: params.get('src') || null,
            sck: params.get('sck') || null,
            utm_source: params.get('utm_source') || null,
            utm_campaign: params.get('utm_campaign') || null,
            utm_medium: params.get('utm_medium') || null,
            utm_content: params.get('utm_content') || null,
            utm_term: params.get('utm_term') || null
        };
    }

    function updateSummary() {
        const grandTotal = orderBumpsTotal + contributionValue;
        contributionElement.textContent = formatCurrency(contributionValue);
        totalElement.textContent = formatCurrency(grandTotal);
        return grandTotal;
    }

    function validateContribution() {
        const grandTotal = updateSummary();
        errorMessage.style.display = 'none';
        maxErrorMessage.style.display = 'none';

        if (grandTotal < MIN_CONTRIBUTION) {
            errorMessage.style.display = 'block';
            return false;
        } else if (grandTotal > MAX_CONTRIBUTION) {
            maxErrorMessage.style.display = 'block';
            return false;
        }
        return true;
    }

    async function processPayment() {
        if (isProcessing) return;
        
        const now = Date.now();
        if (now - lastClickTime < REQUEST_COOLDOWN) return;
    
        isProcessing = true;
        lastClickTime = now;
        contributeButton.disabled = true;
        contributeButton.classList.add('processing'); 
        try {
            const grandTotal = orderBumpsTotal + contributionValue;
            const trackingParams = getTrackingParams();
    
            const response = await fetch('../api/genpix.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: grandTotal.toFixed(2),
                    utm: trackingParams
                })
            });
    
            const data = await response.json();
    
            if (response.ok) {
                localStorage.setItem("transactionId", data.transactionId);
                localStorage.setItem("identifier", data.clientIdentifier);
                
                const params = new URLSearchParams({
                    amount: grandTotal.toFixed(2),
                    qrcode: encodeURIComponent(data.pix.base64),
                    pixcode: encodeURIComponent(data.pix.code)
                });
    
                window.location.href = `../compra.html?${params.toString()}`;
            } else {
                throw new Error(data.error || 'Erro no processamento do pagamento');
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Ocorreu um erro ao processar seu pagamento. Tente novamente.');
        } finally {
            setTimeout(() => {
                isProcessing = false;
                contributeButton.disabled = false;
                contributeButton.classList.remove('processing');
            }, REQUEST_COOLDOWN);
        }
    }

    charityItems.forEach(item => {
        item.addEventListener('click', () => {
            item.classList.toggle('selected');
            const value = parseFloat(item.getAttribute('data-value'));
            orderBumpsTotal += item.classList.contains('selected') ? value : -value;
            validateContribution();
        });
    });

    contributionInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        contributionValue = parseFloat(value) / 100 || 0;
        e.target.value = formatCurrency(contributionValue);
        validateContribution();
    });

    contributeButton.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!validateContribution() || isProcessing) return;
        await processPayment();
    });

    contributionInput.value = formatCurrency(0);
    errorMessage.style.display = 'none';
    maxErrorMessage.style.display = 'none';
    validateContribution();
});