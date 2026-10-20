(function (global) {
    'use strict';

    var state = { creating: false, search: '', status: '', audience: '', type: '', period: '', detailId: '', editingId: '', saving: false, processing: false, refreshing: false, attachments: [], processingImages: false, imageBatchId: 0, imageError: '' };
    var rootId = 'notifications-tab';
    var campaignStorageKey = 'residenthub_notification_campaigns_v1';
    var maxCampaignImages = 4;
    var maxImageBytes = 350 * 1024;
    var maxAttachmentBytes = 900 * 1024;
    var typeLabels = {
        ANNOUNCEMENT: 'Ban quản lý',
        BILLING: 'Thanh toán',
        CONTRACT: 'Hợp đồng',
        REQUEST: 'Yêu cầu hỗ trợ',
        UTILITY: 'Tiện ích'
    };
    var statusLabels = { sent: 'Đã gửi', scheduled: 'Đã lên lịch', draft: 'Bản nháp' };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
        });
    }

    function can(permission) {
        return !!(global.RHP && typeof global.RHP.can === 'function' && global.RHP.can(permission));
    }

    function guard(permission) {
        if (global.RHP && typeof global.RHP.guard === 'function') return global.RHP.guard(permission);
        global.alert('Không thể xác minh quyền thao tác. Vui lòng tải lại trang và thử lại.');
        return false;
    }

    function residents() {
        if (!global.RH || typeof global.RH.getUsers !== 'function') throw new Error('Không thể đọc danh sách tài khoản cư dân.');
        return global.RH.getUsers().filter(function (user) {
            return user && (user.role === 'resident' || (!user.role && user.accountTypeId === 'at-resident'));
        });
    }

    function listData(name) {
        return global.RHD && typeof global.RHD.list === 'function' ? global.RHD.list(name) : [];
    }

    function options(items, selectedId, label) {
        return items.map(function (item) {
            return '<option value="' + escapeHtml(item.id) + '"' + (String(item.id) === String(selectedId || '') ? ' selected' : '') + '>' +
                escapeHtml(label(item)) + '</option>';
        }).join('');
    }

    function imageMarkup(images, removable) {
        return (images || []).map(function (image, index) {
            return '<div class="notification-manager-image-preview"><img src="' + escapeHtml(image.dataUrl) + '" alt="' + escapeHtml(image.name || 'Ảnh đính kèm') + '">' +
                (removable ? '<button type="button" data-notification-action="remove-image" data-image-index="' + index + '" aria-label="Xóa ảnh ' + (index + 1) + '"><i class="fas fa-xmark"></i></button>' : '') +
                '<span>' + escapeHtml(image.name || 'Ảnh ' + (index + 1)) + '</span></div>';
        }).join('');
    }

    function compressNotificationImage(file) {
        return new Promise(function (resolve, reject) {
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
                reject(new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.'));
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error('Mỗi ảnh phải nhỏ hơn 10 MB trước khi nén.'));
                return;
            }
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('Không thể đọc tệp ảnh đã chọn.')); };
            reader.onload = function () {
                var image = new Image();
                image.onerror = function () { reject(new Error('Tệp ảnh không hợp lệ hoặc không thể mở.')); };
                image.onload = function () {
                    try {
                        var scale = Math.min(1, 1400 / Math.max(image.width, image.height));
                        var canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(image.width * scale));
                        canvas.height = Math.max(1, Math.round(image.height * scale));
                        var context = canvas.getContext('2d');
                        context.fillStyle = '#fff';
                        context.fillRect(0, 0, canvas.width, canvas.height);
                        context.drawImage(image, 0, 0, canvas.width, canvas.height);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
                        if (dataUrl.length * 0.75 > maxImageBytes) {
                            reject(new Error('Ảnh "' + file.name + '" vẫn quá lớn sau khi nén. Hãy chọn ảnh khác.'));
                            return;
                        }
                        resolve({ name: file.name, type: 'image/jpeg', dataUrl: dataUrl });
                    } catch (error) {
                        reject(new Error('Không thể nén ảnh "' + file.name + '": ' + (error.message || error)));
                    }
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function addImageFiles(files, root) {
        var selected = Array.prototype.slice.call(files || []);
        if (!selected.length || state.processingImages) return;
        var available = maxCampaignImages - state.attachments.length;
        if (selected.length > available) {
            state.imageError = 'Mỗi thông báo có thể đính kèm tối đa ' + maxCampaignImages + ' ảnh.';
            renderImagePicker(root);
            return;
        }
        if (!selected.length) {
            renderImagePicker(root);
            return;
        }
        state.processingImages = true;
        var batchId = ++state.imageBatchId;
        renderImagePicker(root);
        Promise.all(selected.map(compressNotificationImage)).then(function (images) {
            if (batchId !== state.imageBatchId) return;
            var totalBytes = state.attachments.reduce(function (sum, image) { return sum + image.dataUrl.length * 0.75; }, 0) +
                images.reduce(function (sum, image) { return sum + image.dataUrl.length * 0.75; }, 0);
            if (totalBytes > maxAttachmentBytes) throw new Error('Tổng dung lượng ảnh sau khi nén không được vượt quá 900 KB.');
            state.attachments = state.attachments.concat(images);
            state.imageError = '';
        }).catch(function (error) {
            if (batchId === state.imageBatchId) state.imageError = error.message || String(error);
        }).then(function () {
            if (batchId !== state.imageBatchId) return;
            state.processingImages = false;
            renderImagePicker(root);
        });
    }

    function renderImagePicker(root) {
        var preview = root.querySelector('[data-notification-image-preview]');
        var status = root.querySelector('[data-notification-image-status]');
        var error = root.querySelector('[data-notification-image-error]');
        if (preview) preview.innerHTML = imageMarkup(state.attachments, true);
        if (status) status.textContent = state.processingImages ? 'Đang nén ảnh…' : state.attachments.length + ' / ' + maxCampaignImages + ' ảnh';
        if (error) error.textContent = state.imageError;
    }

    function readCampaignStore() {
        var raw = global.localStorage.getItem(campaignStorageKey);
        if (!raw) return [];
        var value = JSON.parse(raw);
        if (!Array.isArray(value)) throw new Error('Kho chiến dịch thông báo không hợp lệ.');
        return value;
    }

    function writeCampaignStore(items) {
        global.localStorage.setItem(campaignStorageKey, JSON.stringify(items));
        global.dispatchEvent(new CustomEvent('residenthub:notification-campaigns-changed'));
    }

    function currentRecipients(audience, buildingId, apartmentId) {
        var selectedBuilding = listData('buildings').find(function (item) { return String(item.id) === String(buildingId || ''); });
        var selectedApartment = listData('apartments').find(function (item) { return String(item.id) === String(apartmentId || ''); });
        var buildingValues = [buildingId, selectedBuilding && selectedBuilding.name, selectedBuilding && selectedBuilding.code].filter(Boolean).map(String);
        var apartmentValues = [apartmentId, selectedApartment && selectedApartment.name, selectedApartment && selectedApartment.code].filter(Boolean).map(function (value) { return String(value).toLocaleLowerCase(); });
        return residents().filter(function (user) {
            if (audience === 'building') {
                var userBuildings = [user.building, user.buildingId].concat(Array.isArray(user.buildingIds) ? user.buildingIds : []).filter(Boolean).map(String);
                return userBuildings.some(function (value) { return buildingValues.indexOf(value) !== -1; });
            }
            if (audience === 'apartment') {
                var userApartments = [user.apartmentId, user.unit].filter(Boolean).map(function (value) { return String(value).toLocaleLowerCase(); });
                return userApartments.some(function (value) { return apartmentValues.indexOf(value) !== -1; });
            }
            return true;
        });
    }

    function deliverCampaign(campaign) {
        var usersById = new Map(residents().map(function (user) { return [String(user.id), user]; }));
        var failures = [];
        campaign.targetUserIds.forEach(function (userId) {
            var user = usersById.get(String(userId));
            if (!user) {
                failures.push(String(userId) + ': không tìm thấy tài khoản cư dân.');
                return;
            }
            var existing = global.RH.getNotificationsForUser(user.id).some(function (item) {
                return String(item.campaignId || '') === String(campaign.id) ||
                    (item.subType === 'MANAGER_MESSAGE' && String(item.refId || '') === String(campaign.id));
            });
            if (existing) return;
            try {
                var result = global.RH.createNotificationForUser(user.id, {
                    type: campaign.type,
                    subType: 'MANAGER_MESSAGE',
                    title: campaign.title,
                    body: global.RHGeneralSettings ? global.RHGeneralSettings.campaignBody(campaign, user) : campaign.body,
                    priority: campaign.priority,
                    refType: 'notifications',
                    refId: campaign.id,
                    actionUrl: 'notifications',
                    actionLabel: 'Xem thông báo',
                    audience: campaign.audience,
                    audienceName: campaign.audienceName,
                    campaignId: campaign.id,
                    recipientCount: campaign.targetUserIds.length,
                    status: 'sent',
                    time: new Date(campaign.scheduledAt || campaign.createdAt).toLocaleString('vi-VN'),
                    createdAt: campaign.scheduledAt || campaign.createdAt,
                    updatedAt: Date.now(),
                    createdBy: campaign.createdBy
                });
                if (!result || !result.ok) failures.push((user.name || user.id) + ': ' + (result && result.error || 'Không thể lưu thông báo.'));
            } catch (error) {
                failures.push((user.name || user.id) + ': ' + (error.message || 'Lỗi lưu thông báo.'));
                console.error('Không thể gửi thông báo đến cư dân ' + user.id, error);
            }
        });
        return failures;
    }

    function processDueCampaigns(items) {
        if (state.processing) return items;
        var due = items.filter(function (item) {
            return item.status === 'scheduled' && new Date(item.scheduledAt).getTime() <= Date.now();
        });
        if (!due.length) return items;
        state.processing = true;
        try {
            due.forEach(function (campaign) {
                var failures = deliverCampaign(campaign);
                if (!failures.length) {
                    campaign.status = 'sent';
                    campaign.sentAt = Date.now();
                    campaign.lastDeliveryError = '';
                } else {
                    campaign.lastDeliveryError = failures.join('\n');
                    console.error('Một số lượt gửi thông báo chưa hoàn tất:', failures);
                }
            });
            writeCampaignStore(items);
        } finally {
            state.processing = false;
        }
        return items;
    }

    function campaigns() {
        if (!global.RH || typeof global.RH.getNotificationsForUser !== 'function') throw new Error('Không thể đọc dữ liệu thông báo cư dân.');
        var saved = processDueCampaigns(readCampaignStore());
        var grouped = new Map();
        saved.forEach(function (campaign) {
            if (!grouped.has(campaign.id)) {
                grouped.set(campaign.id, Object.assign({}, campaign, {
                    recipients: [],
                    readCount: 0,
                    recipientCount: 0,
                    targetUserIds: Array.from(new Set(campaign.targetUserIds || []))
                }));
            }
        });
        residents().forEach(function (user) {
            var items = global.RH.getNotificationsForUser(user.id);
            if (!Array.isArray(items)) return;
            items.forEach(function (item) {
                var status = item.status || (item.scheduledAt ? 'scheduled' : 'sent');
                if (status === 'scheduled' && item.scheduledAt && new Date(item.scheduledAt).getTime() <= Date.now()) status = 'sent';
                var legacyCampaignId = item.subType === 'MANAGER_MESSAGE' && item.refId ? item.refId : '';
                var key = item.campaignId || legacyCampaignId ||
                    'legacy:' + JSON.stringify([item.title || '', item.body || '', item.type || '', item.audience || '', item.time || '', status]);
                var campaign = grouped.get(key);
                if (!campaign) {
                    campaign = Object.assign({}, item, { id: key, status: status, recipients: [], readCount: 0, recipientCount: 0, targetUserIds: [] });
                    grouped.set(key, campaign);
                }
                if (!campaign.recipients.some(function (recipient) { return String(recipient.id) === String(user.id); })) {
                    campaign.recipients.push({ id: user.id, name: user.name || user.email || 'Cư dân', isRead: !!item.isRead });
                    if (!campaign.targetUserIds.some(function (id) { return String(id) === String(user.id); })) {
                        campaign.targetUserIds.push(user.id);
                    }
                    if (item.isRead) campaign.readCount += 1;
                }
            });
        });
        return Array.from(grouped.values()).map(function (item) {
            item.recipientCount = Math.max(item.recipients.length, Number(item.recipientCount) || 0);
            if (item.status === 'draft' || item.status === 'scheduled') item.recipientCount = item.targetUserIds.length;
            return item;
        }).sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt || b.time || 0).getTime() - new Date(a.updatedAt || a.createdAt || a.time || 0).getTime();
        });
    }

    function visibleCampaigns(items) {
        var search = state.search.trim().toLocaleLowerCase('vi');
        var now = Date.now();
        return items.filter(function (item) {
            return (!state.status || item.status === state.status) &&
                (!state.audience || (item.audience || 'all') === state.audience) &&
                (!state.type || item.type === state.type) &&
                (!state.period || (function () {
                    var time = new Date(item.createdAt || item.updatedAt || item.time || 0).getTime();
                    if (!time) return false;
                    if (state.period === 'today') return new Date(time).toDateString() === new Date(now).toDateString();
                    if (state.period === '7days') return now - time <= 7 * 24 * 60 * 60 * 1000;
                    if (state.period === '30days') return now - time <= 30 * 24 * 60 * 60 * 1000;
                    return true;
                })()) &&
                (!search || (String(item.title || '') + ' ' + String(item.body || '')).toLocaleLowerCase('vi').includes(search));
        });
    }

    function formatTime(item) {
        var value = item.scheduledAt || item.createdAt || item.updatedAt || item.time;
        if (!value) return '—';
        var date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    }

    function dateTimeLocal(value) {
        var date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    function audienceLabel(item) {
        if (item.audience === 'building') return item.audienceName ? 'Tòa nhà ' + item.audienceName : 'Theo tòa nhà';
        if (item.audience === 'apartment') return item.audienceName ? 'Căn hộ ' + item.audienceName : 'Theo căn hộ';
        return 'Tất cả cư dân';
    }

    function renderDetailPanel(item) {
        if (!item || state.detailId !== (item.campaignId || item.id)) return '';
        var recipientList = (item.targetUserIds || []).length ? item.targetUserIds.map(function (userId) {
            var delivery = (item.recipients || []).find(function (recipient) { return String(recipient.id) === String(userId); });
            var user = residents().find(function (resident) { return String(resident.id) === String(userId); });
            return {
                id: userId,
                name: user && (user.name || user.email) || delivery && delivery.name || 'Cư dân',
                isRead: !!(delivery && delivery.isRead),
                delivered: !!delivery
            };
        }) : item.recipients || [];
        var recipients = recipientList.map(function (recipient) {
            return '<li><span>' + escapeHtml(recipient.name) + '</span><span class="notification-manager-recipient-state">' +
                (item.status === 'draft' ? 'Bản nháp' : item.status === 'scheduled' ? 'Chờ gửi' : recipient.delivered === false ? 'Chưa gửi' : recipient.isRead ? 'Đã đọc' : 'Chưa đọc') + '</span></li>';
        }).join('');
        var attachments = imageMarkup(item.attachments, false);
        return '<div class="notification-manager-overlay" data-notification-action="close-detail">' +
            '<section class="notification-manager-detail" role="dialog" aria-modal="true" aria-labelledby="notificationDetailTitle" data-notification-detail>' +
            '<header><div><span class="notification-manager-eyebrow">Chi tiết thông báo</span><h3 id="notificationDetailTitle">' + escapeHtml(item.title || 'Thông báo') + '</h3></div>' +
            '<button type="button" class="notification-manager-icon-button" aria-label="Đóng chi tiết" data-notification-action="close-detail"><i class="fas fa-times"></i></button></header>' +
            '<div class="notification-manager-detail-meta"><span>' + escapeHtml(typeLabels[item.type] || 'Ban quản lý') + '</span><span>' + escapeHtml(audienceLabel(item)) + '</span><span>' + escapeHtml(formatTime(item)) + '</span></div>' +
            '<p class="notification-manager-detail-body">' + escapeHtml(item.body || '') + '</p>' +
            (attachments ? '<div class="notification-manager-detail-images">' + attachments + '</div>' : '') +
            '<div class="notification-manager-detail-summary">' + (item.status === 'draft' ? 'Bản nháp chưa được gửi.' : item.status === 'scheduled' ? 'Thông báo sẽ tự động gửi đến ' + escapeHtml(item.recipientCount) + ' cư dân vào ' + escapeHtml(formatTime({ scheduledAt: item.scheduledAt })) + '.' : '<strong>' + escapeHtml(item.readCount) + '</strong> / <strong>' + escapeHtml(item.recipientCount) + '</strong> cư dân đã đọc') + '</div>' +
            (item.lastDeliveryError ? '<p class="notification-manager-delivery-error">Chưa gửi được đến một số cư dân; hệ thống sẽ thử lại. ' + escapeHtml(item.lastDeliveryError) + '</p>' : '') +
            (recipients ? '<ul class="notification-manager-recipient-list">' + recipients + '</ul>' : '<p class="notification-manager-muted">Danh sách cư dân nhận không còn khả dụng.</p>') +
            (item.status === 'draft' && can('notifications.update') ? '<footer class="notification-manager-actions"><button type="button" class="btn-secondary" data-notification-action="edit-draft" data-notification-id="' + escapeHtml(item.id) + '">Chỉnh sửa bản nháp</button></footer>' : '') +
            (item.status === 'scheduled' && can('notifications.update') ? '<footer class="notification-manager-actions"><button type="button" class="btn-secondary" data-notification-action="cancel-schedule" data-notification-id="' + escapeHtml(item.id) + '">Hủy lịch gửi</button></footer>' : '') +
            '</section></div>';
    }

    function renderCreatePanel(buildings, apartments) {
        if (!state.creating) return '';
        var editing = state.editingId ? readCampaignStore().find(function (item) { return item.id === state.editingId; }) : null;
        var editValue = function (key) { return escapeHtml(editing && editing[key] || ''); };
        var scheduledValue = '';
        if (editing && editing.scheduledAt) {
            scheduledValue = dateTimeLocal(editing.scheduledAt);
        }
        return '<section class="notification-manager-card" aria-labelledby="notificationManagerCreateTitle">' +
            '<h3 id="notificationManagerCreateTitle">' + (editing ? 'Chỉnh sửa thông báo' : 'Tạo thông báo cho cư dân') + '</h3>' +
            '<form class="notification-manager-form" data-notification-manager-form>' +
            '<div class="notification-manager-form-grid">' +
            '<label>Tiêu đề<input name="title" maxlength="160" value="' + editValue('title') + '"></label>' +
            '<label>Loại thông báo<select name="type">' + Object.keys(typeLabels).map(function (type) {
                return '<option value="' + type + '"' + (editing && editing.type === type ? ' selected' : '') + '>' + typeLabels[type] + '</option>';
            }).join('') + '</select></label>' +
            '<label>Đối tượng nhận<select name="audience" data-notification-audience><option value="all"' + (!editing || !editing.audience || editing.audience === 'all' ? ' selected' : '') + '>Tất cả cư dân</option><option value="building"' + (editing && editing.audience === 'building' ? ' selected' : '') + '>Theo tòa nhà</option><option value="apartment"' + (editing && editing.audience === 'apartment' ? ' selected' : '') + '>Theo căn hộ</option></select></label>' +
            '<label data-audience-building hidden>Tòa nhà<select name="buildingId" data-notification-building><option value="">Chọn tòa nhà</option>' +
            options(buildings, editing && editing.buildingId, function (item) { return item.name || item.code || item.id; }) + '</select></label>' +
            '<label data-audience-apartment hidden>Căn hộ<select name="apartmentId" data-notification-apartment><option value="">Chọn căn hộ</option>' +
            options(apartments, editing && editing.apartmentId, function (item) { return item.name || item.code || item.id; }) + '</select></label>' +
            '<label>Mức độ ưu tiên<select name="priority"><option value="NORMAL"' + (!editing || editing.priority === 'NORMAL' ? ' selected' : '') + '>Bình thường</option><option value="HIGH"' + (editing && editing.priority === 'HIGH' ? ' selected' : '') + '>Quan trọng</option><option value="URGENT"' + (editing && editing.priority === 'URGENT' ? ' selected' : '') + '>Khẩn cấp</option></select></label>' +
            '<label>Thời gian gửi<input name="scheduledAt" type="datetime-local" min="' + dateTimeLocal(Date.now() + 60000) + '" value="' + escapeHtml(scheduledValue) + '"><small>Chọn thời gian tương lai để hẹn lịch gửi.</small></label>' +
            '</div><label>Nội dung<textarea name="body" maxlength="5000">' + editValue('body') + '</textarea></label>' +
            '<section class="notification-manager-upload" data-notification-dropzone><div class="notification-manager-upload-heading"><div><strong><i class="fas fa-images"></i> Hình ảnh đính kèm</strong><small>Ảnh sẽ được nén tự động và hiển thị trong thông báo cư dân.</small></div><span data-notification-image-status>' + state.attachments.length + ' / ' + maxCampaignImages + ' ảnh</span></div>' +
            '<label class="notification-manager-upload-drop"><i class="fas fa-cloud-arrow-up"></i><span><strong>Chọn ảnh để tải lên</strong><small>JPG, PNG hoặc WebP · tối đa 4 ảnh · 10 MB mỗi ảnh trước khi nén</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-notification-image-input></label>' +
            '<p class="notification-manager-upload-error" data-notification-image-error role="alert">' + escapeHtml(state.imageError) + '</p><div class="notification-manager-image-grid" data-notification-image-preview>' + imageMarkup(state.attachments, true) + '</div></section>' +
            '<div class="notification-manager-actions"><button type="button" class="btn-secondary" data-notification-action="close-create">Hủy</button><button type="submit" name="notificationAction" value="draft" class="btn-secondary">Lưu bản nháp</button><button type="submit" name="notificationAction" value="schedule" class="btn-secondary">Hẹn lịch gửi</button><button type="submit" name="notificationAction" value="send" class="btn-primary">Gửi ngay</button></div>' +
            '</form></section>';
    }

    function render() {
        var root = document.getElementById(rootId);
        if (!root) return;
        try {
            var all = campaigns();
            var filtered = visibleCampaigns(all);
            var sent = all.filter(function (item) { return item.status === 'sent'; });
            var scheduled = all.filter(function (item) { return item.status === 'scheduled'; });
            var drafts = all.filter(function (item) { return item.status === 'draft'; });
            var recipients = sent.reduce(function (sum, item) { return sum + item.recipientCount; }, 0);
            var read = sent.reduce(function (sum, item) { return sum + item.readCount; }, 0);
            var buildings = listData('buildings');
            var apartments = listData('apartments');
            var rows = filtered.map(function (item) {
                var type = typeLabels[item.type] || 'Ban quản lý';
                var status = statusLabels[item.status] || statusLabels.sent;
                var summary = String(item.body || '').trim();
                if (summary.length > 64) summary = summary.slice(0, 61) + '…';
                var readRate = item.recipientCount ? Math.round(item.readCount / item.recipientCount * 100) : 0;
                return '<tr><td><div class="notification-manager-title-cell"><span class="notification-manager-type-icon type-' + escapeHtml(item.type || 'ANNOUNCEMENT').toLowerCase() + '"><i class="fas fa-bell"></i></span><div><strong>' + escapeHtml(item.title || 'Thông báo') + '</strong><small>' + escapeHtml(summary) + '</small></div></div></td>' +
                    '<td><span class="notification-manager-type-pill">' + escapeHtml(type) + '</span></td>' +
                    '<td class="notification-manager-audience">' + escapeHtml(audienceLabel(item)) + '<small>' + escapeHtml(item.recipientCount) + ' người</small></td>' +
                    '<td>' + escapeHtml(item.createdBy || 'Ban quản lý') + '</td><td>' + escapeHtml(formatTime(item)) + '<small>' + (item.status === 'scheduled' ? 'Chờ gửi' : item.status === 'draft' ? 'Chưa gửi' : 'Đã gửi') + '</small></td>' +
                    '<td>' + escapeHtml(item.recipientCount) + '</td><td>' + escapeHtml(item.readCount) + '<small>(' + readRate + '%)</small></td>' +
                    '<td><span class="notification-manager-status status-' + escapeHtml(item.status) + '">' + escapeHtml(status) + '</span></td>' +
                    '<td><button type="button" class="notification-manager-icon-button" title="Xem chi tiết" aria-label="Xem chi tiết: ' + escapeHtml(item.title || 'Thông báo') + '" data-notification-action="view-detail" data-notification-id="' + escapeHtml(item.campaignId || item.id) + '"><i class="fas fa-eye"></i></button></td></tr>';
            }).join('');

            root.classList.add('notification-manager-page');
            root.innerHTML =
                '<header class="notification-manager-header"><div class="notification-manager-heading"><span class="notification-manager-heading-icon"><i class="fas fa-bell"></i></span><div><h2>Quản lý thông báo</h2><p>Tạo, gửi và theo dõi thông báo đến cư dân trong hệ thống</p></div></div>' +
                '<div class="notification-manager-header-actions">' + (can('notifications.create') ? '<button type="button" class="btn-primary" data-notification-action="open-create"><i class="fas fa-plus"></i> Tạo thông báo mới</button>' : '') + '<button type="button" class="btn-secondary" data-notification-action="refresh"' + (state.refreshing ? ' disabled aria-busy="true"' : '') + '><i class="fas fa-rotate' + (state.refreshing ? ' fa-spin' : '') + '"></i> ' + (state.refreshing ? 'Đang làm mới' : 'Làm mới') + '</button></div></header>' +
                '<div class="notification-manager-stats">' +
                '<div class="notification-manager-card notification-manager-stat"><span class="stat-icon blue"><i class="fas fa-bullhorn"></i></span><div><small>Tổng thông báo</small><strong>' + all.length + '</strong></div></div>' +
                '<div class="notification-manager-card notification-manager-stat"><span class="stat-icon green"><i class="fas fa-paper-plane"></i></span><div><small>Đã gửi</small><strong>' + sent.length + '</strong></div></div>' +
                '<div class="notification-manager-card notification-manager-stat"><span class="stat-icon purple"><i class="far fa-clock"></i></span><div><small>Đã lên lịch</small><strong>' + scheduled.length + '</strong></div></div>' +
                '<div class="notification-manager-card notification-manager-stat"><span class="stat-icon orange"><i class="fas fa-file-lines"></i></span><div><small>Bản nháp</small><strong>' + drafts.length + '</strong></div></div>' +
                '<div class="notification-manager-card notification-manager-stat"><span class="stat-icon cyan"><i class="fas fa-eye"></i></span><div><small>Tỷ lệ đã đọc</small><strong>' + (recipients ? Math.round(read / recipients * 100) : 0) + '%</strong><small class="notification-manager-stat-foot">' + read.toLocaleString('vi-VN') + ' / ' + recipients.toLocaleString('vi-VN') + ' người nhận</small></div></div>' +
                '</div>' +
                renderCreatePanel(buildings, apartments) +
                '<section class="notification-manager-card" aria-label="Lịch sử thông báo">' +
                '<div class="notification-manager-toolbar"><input type="search" aria-label="Tìm thông báo" placeholder="Tìm theo tiêu đề hoặc nội dung..." value="' + escapeHtml(state.search) + '" data-notification-search>' +
                '<select aria-label="Lọc theo trạng thái" data-notification-status><option value="">Tất cả trạng thái</option>' +
                Object.keys(statusLabels).map(function (status) { return '<option value="' + status + '"' + (state.status === status ? ' selected' : '') + '>' + statusLabels[status] + '</option>'; }).join('') +
                '</select><select aria-label="Lọc theo loại thông báo" data-notification-type><option value="">Tất cả loại thông báo</option>' +
                Object.keys(typeLabels).map(function (type) { return '<option value="' + type + '"' + (state.type === type ? ' selected' : '') + '>' + typeLabels[type] + '</option>'; }).join('') +
                '</select><select aria-label="Lọc theo thời gian tạo" data-notification-period><option value="">Thời gian tạo: Tất cả</option><option value="today"' + (state.period === 'today' ? ' selected' : '') + '>Hôm nay</option><option value="7days"' + (state.period === '7days' ? ' selected' : '') + '>7 ngày gần đây</option><option value="30days"' + (state.period === '30days' ? ' selected' : '') + '>30 ngày gần đây</option></select>' +
                '<select aria-label="Lọc theo đối tượng" data-notification-audience-filter><option value="">Tất cả đối tượng</option><option value="all"' + (state.audience === 'all' ? ' selected' : '') + '>Tất cả cư dân</option><option value="building"' + (state.audience === 'building' ? ' selected' : '') + '>Theo tòa nhà</option><option value="apartment"' + (state.audience === 'apartment' ? ' selected' : '') + '>Theo căn hộ</option></select>' +
                '<button type="button" class="notification-manager-reset" data-notification-action="reset-filters">Đặt lại</button></div>' +
                '<div class="notification-manager-table-wrap"><table class="notification-manager-table"><thead><tr><th>Tiêu đề thông báo</th><th>Loại</th><th>Đối tượng nhận</th><th>Người tạo</th><th>Thời gian gửi</th><th>Số người nhận</th><th>Đã đọc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>' +
                (rows || '<tr><td colspan="9" class="notification-manager-empty">' + (all.length ? 'Không có thông báo phù hợp với bộ lọc.' : 'Chưa có thông báo nào được gửi.') + '</td></tr>') +
                '</tbody></table></div><footer class="notification-manager-table-footer"><span>Hiển thị ' + filtered.length + ' trong tổng số ' + all.length + ' thông báo</span></footer></section>' +
                (state.detailId ? renderDetailPanel(all.find(function (item) { return (item.campaignId || item.id) === state.detailId; })) : '');
            bindRoot(root);
            updateAudienceFields(root);
        } catch (error) {
            root.innerHTML = '<div class="notification-manager-error" role="alert">Không thể tải quản lý thông báo: ' + escapeHtml(error.message || error) + '</div>';
        }
    }

    function updateAudienceFields(root) {
        var audience = root.querySelector('[data-notification-audience]');
        if (!audience) return;
        var building = root.querySelector('[data-audience-building]');
        var apartment = root.querySelector('[data-audience-apartment]');
        if (building) building.hidden = audience.value !== 'building';
        if (apartment) apartment.hidden = audience.value !== 'apartment';
    }

    function bindRoot(root) {
        if (root.dataset.notificationManagerBound) return;
        root.dataset.notificationManagerBound = 'true';
        root.addEventListener('click', function (event) {
            var button = event.target.closest('[data-notification-action]');
            if (!button) return;
            if (button.dataset.notificationAction === 'open-create') {
                if (!guard('notifications.create')) return;
                state.creating = true;
                state.editingId = '';
                state.imageBatchId++;
                state.processingImages = false;
                state.attachments = [];
                state.imageError = '';
            } else if (button.dataset.notificationAction === 'close-create') {
                state.creating = false;
                state.editingId = '';
                state.imageBatchId++;
                state.processingImages = false;
                state.attachments = [];
                state.imageError = '';
            } else if (button.dataset.notificationAction === 'remove-image') {
                state.attachments.splice(Number(button.dataset.imageIndex), 1);
                state.imageError = '';
                renderImagePicker(root);
                return;
            }
            else if (button.dataset.notificationAction === 'refresh') {
                if (state.refreshing) return;
                state.refreshing = true;
                render();
                global.setTimeout(function () {
                    try { campaigns(); }
                    catch (error) { console.error('Không thể làm mới thông báo:', error); }
                    state.refreshing = false;
                    render();
                }, 180);
                return;
            } else if (button.dataset.notificationAction === 'view-detail') {
                state.detailId = button.dataset.notificationId || '';
            } else if (button.dataset.notificationAction === 'close-detail') {
                if (event.target.closest('[data-notification-detail]') && !event.target.closest('button')) return;
                state.detailId = '';
            } else if (button.dataset.notificationAction === 'edit-draft') {
                if (!guard('notifications.update')) return;
                state.editingId = button.dataset.notificationId || '';
                state.creating = true;
                var draft = readCampaignStore().find(function (item) { return item.id === state.editingId; });
                state.attachments = draft && Array.isArray(draft.attachments) ? draft.attachments.slice() : [];
                state.imageError = '';
                state.detailId = '';
            } else if (button.dataset.notificationAction === 'cancel-schedule') {
                if (!guard('notifications.update')) return;
                try {
                    var items = readCampaignStore();
                    var scheduled = items.find(function (item) { return item.id === button.dataset.notificationId; });
                    if (scheduled) {
                        scheduled.status = 'draft';
                        scheduled.scheduledAt = '';
                        scheduled.targetUserIds = [];
                        writeCampaignStore(items);
                    }
                } catch (error) {
                    global.alert('Không thể hủy lịch gửi: ' + (error.message || error));
                    return;
                }
                state.detailId = '';
            }
            else if (button.dataset.notificationAction === 'reset-filters') {
                state.search = '';
                state.status = '';
                state.audience = '';
                state.type = '';
                state.period = '';
            } else return;
            render();
        });
        root.addEventListener('input', function (event) {
            if (!event.target.matches('[data-notification-search]')) return;
            state.search = event.target.value;
            var start = event.target.selectionStart;
            render();
            var input = root.querySelector('[data-notification-search]');
            if (input) {
                input.focus();
                input.setSelectionRange(start, start);
            }
        });
        root.addEventListener('change', function (event) {
            if (event.target.matches('[data-notification-image-input]')) {
                addImageFiles(event.target.files, root);
                event.target.value = '';
                return;
            } else if (event.target.matches('[data-notification-status]')) state.status = event.target.value;
            else if (event.target.matches('[data-notification-audience-filter]')) state.audience = event.target.value;
            else if (event.target.matches('[data-notification-type]')) state.type = event.target.value;
            else if (event.target.matches('[data-notification-period]')) state.period = event.target.value;
            else if (event.target.matches('[data-notification-audience]')) {
                updateAudienceFields(root);
                return;
            } else return;
            render();
        });
        root.addEventListener('dragover', function (event) {
            var dropzone = event.target.closest('[data-notification-dropzone]');
            if (!dropzone) return;
            event.preventDefault();
            dropzone.classList.add('is-dragging');
        });
        root.addEventListener('dragleave', function (event) {
            var dropzone = event.target.closest('[data-notification-dropzone]');
            if (dropzone && !dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging');
        });
        root.addEventListener('drop', function (event) {
            var dropzone = event.target.closest('[data-notification-dropzone]');
            if (!dropzone) return;
            event.preventDefault();
            dropzone.classList.remove('is-dragging');
            addImageFiles(event.dataTransfer.files, root);
        });
        root.addEventListener('submit', function (event) {
            if (!event.target.matches('[data-notification-manager-form]')) return;
            event.preventDefault();
            sendNotification(event.target, event.submitter && event.submitter.value || 'send');
        });
    }

    function sendNotification(form, action) {
        if (state.saving) return;
        if (!guard(state.editingId ? 'notifications.update' : 'notifications.create')) return;
        if (state.processingImages) {
            global.alert('Vui lòng đợi ảnh được nén xong trước khi lưu thông báo.');
            return;
        }
        if (state.imageError) {
            global.alert('Vui lòng xử lý lỗi ảnh đính kèm trước khi lưu: ' + state.imageError);
            return;
        }
        var data = new FormData(form);
        var title = String(data.get('title') || '').trim();
        var body = String(data.get('body') || '').trim();
        var audience = String(data.get('audience') || 'all');
        if (action !== 'draft' && (!title || !body)) {
            global.alert('Vui lòng nhập tiêu đề và nội dung thông báo.');
            return;
        }
        var buildingId = String(data.get('buildingId') || '');
        var apartmentId = String(data.get('apartmentId') || '');
        if (action !== 'draft' && audience === 'building' && !buildingId) {
            global.alert('Vui lòng chọn tòa nhà nhận thông báo.');
            return;
        }
        if (action !== 'draft' && audience === 'apartment' && !apartmentId) {
            global.alert('Vui lòng chọn căn hộ nhận thông báo.');
            return;
        }
        var scheduledAt = data.get('scheduledAt') ? new Date(data.get('scheduledAt')).getTime() : 0;
        var notificationPolicy = global.RHGeneralSettings ? global.RHGeneralSettings.campaignPolicy() : null;
        if (action !== 'draft' && notificationPolicy && !notificationPolicy.enabled) {
            global.alert('Thông báo hoạt động tòa nhà đang tắt trong Cài đặt chung.');
            return;
        }
        if (action === 'send' && notificationPolicy && notificationPolicy.time) {
            action = 'schedule';
            scheduledAt = global.RHGeneralSettings.nextCampaignSend(notificationPolicy.time);
        }
        if (action === 'schedule' && (!scheduledAt || scheduledAt <= Date.now())) {
            global.alert('Vui lòng chọn thời gian gửi trong tương lai.');
            return;
        }
        var targetUsers = action === 'draft' ? [] : currentRecipients(audience, buildingId, apartmentId);
        if (action !== 'draft' && !targetUsers.length) {
            global.alert('Không tìm thấy cư dân nào phù hợp với đối tượng nhận được chọn.');
            return;
        }
        if (action !== 'draft' && (!global.RH || typeof global.RH.createNotificationForUser !== 'function')) {
            global.alert('Không thể kết nối kho thông báo. Vui lòng tải lại trang và thử lại.');
            return;
        }
        var building = listData('buildings').find(function (item) { return String(item.id) === buildingId; });
        var apartment = listData('apartments').find(function (item) { return String(item.id) === apartmentId; });
        var session = global.RH && global.RH.getSession ? global.RH.getSession() : null;
        var now = Date.now();
        var campaignId = state.editingId || 'notice-' + now + '-' + Math.random().toString(36).slice(2, 8);
        var campaign = {
            id: campaignId,
            title: title,
            body: body,
            notificationPolicy: notificationPolicy,
            type: String(data.get('type') || 'ANNOUNCEMENT'),
            priority: String(data.get('priority') || 'NORMAL'),
            audience: audience,
            buildingId: buildingId,
            apartmentId: apartmentId,
            audienceName: audience === 'building' ? (building && (building.name || building.code) || '') :
                audience === 'apartment' ? (apartment && (apartment.name || apartment.code) || '') : '',
            targetUserIds: targetUsers.map(function (user) { return user.id; }),
            recipientCount: targetUsers.length,
            attachments: state.attachments.slice(),
            createdBy: session && session.name || 'Ban quản lý',
            createdAt: now,
            updatedAt: now,
            status: action === 'draft' ? 'draft' : action === 'schedule' ? 'scheduled' : 'sent',
            scheduledAt: action === 'schedule' ? scheduledAt : ''
        };
        state.saving = true;
        var failures = [];
        try {
            var store = readCampaignStore();
            var index = store.findIndex(function (item) { return item.id === campaignId; });
            if (index === -1) store.unshift(campaign);
            else store[index] = Object.assign({}, store[index], campaign);
            writeCampaignStore(store);
            if (action === 'send') {
                failures = deliverCampaign(campaign);
                campaign.sentAt = now;
                campaign.lastDeliveryError = failures.join('\n');
                writeCampaignStore(store);
            }
        } catch (error) {
            state.saving = false;
            global.alert('Không thể lưu thông báo: ' + (error.message || error));
            return;
        }
        state.saving = false;
        state.creating = false;
        state.editingId = '';
        state.attachments = [];
        state.imageError = '';
        state.search = '';
        state.status = '';
        state.audience = '';
        state.type = '';
        state.period = '';
        render();
        if (action === 'draft') global.alert('Đã lưu bản nháp. Bản nháp chưa hiển thị cho cư dân.');
        else if (action === 'schedule') global.alert('Đã hẹn lịch gửi đến ' + targetUsers.length + ' cư dân vào ' + new Date(scheduledAt).toLocaleString('vi-VN') + '.');
        else global.alert('Đã gửi thông báo đến ' + (targetUsers.length - failures.length) + ' / ' + targetUsers.length + ' cư dân.' + (failures.length ? '\nChưa gửi được:\n' + failures.join('\n') : ''));
    }

    global.renderNotificationsManagerTab = render;
    global.addEventListener('residenthub:data-changed', function () {
        if (!state.saving && !state.processing && document.getElementById(rootId) && document.getElementById(rootId).style.display !== 'none') render();
    });
    global.addEventListener('storage', function (event) {
        if ((event.key === 'residenthub_internal_data' || event.key === campaignStorageKey) && document.getElementById(rootId) && document.getElementById(rootId).style.display !== 'none') render();
    });
    global.addEventListener('residenthub:notification-campaigns-changed', function () {
        if (!state.saving && !state.processing && document.getElementById(rootId) && document.getElementById(rootId).style.display !== 'none') render();
    });
    global.setInterval(function () {
        if (state.saving || state.processing) return;
        try {
            var root = document.getElementById(rootId);
            var hasDueCampaign = readCampaignStore().some(function (item) {
                return item.status === 'scheduled' && new Date(item.scheduledAt).getTime() <= Date.now();
            });
            if (hasDueCampaign) campaigns();
            if (root && root.style.display !== 'none' && hasDueCampaign) render();
        } catch (error) {
            console.error('Không thể kiểm tra lịch gửi thông báo:', error);
        }
    }, 30000);
})(window);
