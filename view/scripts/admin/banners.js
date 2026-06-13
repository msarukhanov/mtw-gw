async function loadAdminBannersMatrix() {
    try {
        const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
        const filterSiteId = document.getElementById('b_filter_site').value;

        let url = `${SERVER_URL}/api/admin/banners?partnerId=${currentPartnerId}`;
        if (filterSiteId) url += `&websiteId=${filterSiteId}`;

        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('adminBannersTableBody');

        if (tbody && data.success && data.banners) {
            cachedBanners = data.banners; // Сохраняем в кэш

            if (data.banners.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No active banners found</td></tr>`;
                return;
            }
            tbody.innerHTML = data.banners.map(b => {
                const isSelectedRow = editingBannerId === b.id ? 'background: rgba(233, 69, 96, 0.08); border-left: 2px solid var(--accent-pink);' : '';

                return `
                    <tr style="border-bottom: 1px solid #141822; cursor:pointer; ${isSelectedRow}" onclick="editBannerNode(${b.id})">
                        <td style="padding:8px 0;"><b>${b.website_title}</b></td>
                        <td><span class="badge" style="background:#161920; border:1px solid var(--border-color); padding:2px 6px; border-radius:4px;">${b.banner_type.toUpperCase()}</span></td>
                        <td onclick="event.stopPropagation();">
                            <a href="${b.image_url}" target="_blank">
                                <img src="${b.image_url}" style="width:80px; height:40px; object-fit:cover; border-radius:4px; border:1px solid #262c3a; background:#000;" onerror="this.src='https://placehold.co'">
                            </a>
                        </td>
                        <td style="font-family:monospace; color:var(--text-muted);">${b.click_url || '—'}</td>
                        <td style="text-align:right; vertical-align: middle;" onclick="event.stopPropagation();">
                            <button type="button" onclick="deleteAdminBannerNode(${b.id})" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; font-size:16px; padding:0 10px;">×</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) { console.error(err); }
}

// 2. Клик на строку таблицы: перенос данных баннера в инпуты
function editBannerNode(bannerId) {
    const banner = cachedBanners.find(b => b.id === bannerId);
    if (!banner) return;

    editingBannerId = bannerId;

    // Заполняем форму
    document.getElementById('b_target_site').value = banner.website_id;
    document.getElementById('b_type').value = banner.banner_type;
    document.getElementById('b_img').value = banner.image_url;
    document.getElementById('b_click').value = banner.click_url;
    document.getElementById('b_order').value = banner.sort_order;

    // Меняем кнопки
    document.getElementById('b_submit_btn').innerText = '🔄 UPDATE SLIDER BANNER';
    document.getElementById('b_cancel_btn').style.display = 'inline-block';

    loadAdminBannersMatrix(); // Обновляем подсветку строк
}

// 3. Сброс формы баннеров
function resetBannerForm() {
    editingBannerId = null;
    document.getElementById('b_img').value = '';
    document.getElementById('b_click').value = '';
    document.getElementById('b_order').value = '0';

    document.getElementById('b_submit_btn').innerText = '🖼️ INJECT SLIDER BANNER';
    document.getElementById('b_cancel_btn').style.display = 'none';

    loadAdminBannersMatrix();
}

// 4. Объединенная функция Создания / Обновления баннера
async function createAdminBannerNode() {
    const websiteId = document.getElementById('b_target_site').value;
    const bannerType = document.getElementById('b_type').value;
    const imageUrl = document.getElementById('b_img').value.trim();
    const clickUrl = document.getElementById('b_click').value.trim();
    const sortOrder = document.getElementById('b_order').value;

    if (!websiteId || !imageUrl) return alert('Target website and Image URL are required fields');

    let targetUrl = `${SERVER_URL}/api/admin/banners/create`;
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';

    const payload = {
        partnerId: currentPartnerId,
        websiteId,
        bannerType,
        imageUrl,
        clickUrl,
        sortOrder
    };

    // Если редактируем — переключаем роут на update и добавляем id
    if (editingBannerId) {
        targetUrl = `${SERVER_URL}/api/admin/banners/update`;
        payload.id = editingBannerId;
    }

    showLoader();
    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.error) {
            alert(editingBannerId ? 'Banner campaign updated!' : 'New banner campaign node injected!');
            resetBannerForm(); // Очистит форму и сбросит ID
        }
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}

// 5. Удаление баннера
async function deleteAdminBannerNode(bannerId) {
    if (!confirm('Are you sure you want to delete this banner campaign node?')) return;
    showLoader();
    const currentPartnerId = localStorage.getItem('partnerId') || 'demo_mtwtech';
    try {
        const res = await fetch(`${SERVER_URL}/api/admin/banners/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: currentPartnerId, bannerId })
        });
        if (!res.error) loadAdminBannersMatrix();
    } catch (err) { console.error(err); }
    finally { hideLoader(); }
}