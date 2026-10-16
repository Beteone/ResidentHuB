import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function checkBuildingAccounts({ evaluate, send, artifactDir }) {
    const buildingCount = await evaluate(`
        RHD.create('buildings',{id:'reference-north',name:'Reference North',code:'TN-REF1',province:'Hà Nội',ward:'Phường Cầu Giấy',addressDetail:'Địa chỉ thử',active:true,billingDay:30,managerId:RH_SESSION.id});
        RHD.create('buildings',{id:'reference-south',name:'Reference South',code:'TN-REF2',province:'TP. Hồ Chí Minh',ward:'Phường Bến Nghé',addressDetail:'Địa chỉ thử',active:true});
        for(let i=1;i<=3;i++)RHD.create('apartments',{id:'reference-a'+i,buildingId:i===3?'reference-south':'reference-north',name:'REF'+i,status:'vacant'});
        switchTab('buildings');
        RHD.list('buildings').length;
    `);
    assert.equal(await evaluate('document.querySelectorAll(".bld-kpi").length'), 3);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".bld-kpis")).display'), 'grid');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".bld-kpi")).display'), 'flex');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".bld-filters")).display'), 'grid');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#bldListWrap th")).map(n=>n.textContent)'), ['Tòa nhà','Địa chỉ','Người quản lý','Căn hộ','Ngày tính tiền','Trạng thái','']);
    assert.equal(await evaluate('document.querySelector("[data-bld-status=all] strong").textContent'), String(buildingCount));
    assert.equal(await evaluate('document.getElementById("buildings-tab").textContent.includes("Thông tin tòa nhà, dịch vụ và ngày tính tiền")'), false);
    await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(artifactDir, 'reference-buildings.png'), Buffer.from(r.data, 'base64')));
    await evaluate('document.getElementById("bldQ").value="North";document.getElementById("bldQ").dispatchEvent(new Event("input"))');
    assert.equal(await evaluate('document.querySelectorAll("#bldListWrap tbody tr").length'), 1);
    await evaluate('document.getElementById("bldClear").click();document.querySelector("[data-bld-status=inactive]").click()');
    assert.equal(await evaluate('document.getElementById("bldListWrap").textContent.includes("Reference North")'), false);
    await evaluate(`document.getElementById('bldClear').click();document.querySelector('#bldProvince .rh-ss-trigger').click();Array.from(document.querySelectorAll('#bldProvince .rh-ss-option')).find(n=>n.textContent.includes('Hà Nội')).click()`);
    assert.equal(await evaluate('document.querySelectorAll("#bldListWrap tbody tr").length'), 1);
    await evaluate(`document.querySelector('#bldWard .rh-ss-trigger').click();Array.from(document.querySelectorAll('#bldWard .rh-ss-option')).find(n=>n.textContent.includes('Phường Cầu Giấy')).click()`);
    assert.equal(await evaluate('document.getElementById("bldListWrap").textContent.includes("Reference North")'), true);
    await evaluate('document.getElementById("bldClear").click();RHUI.openBuildingForm();document.getElementById("bfName").value="CRUD Building";document.getElementById("bfShort").value="CRUD";document.getElementById("bfProvince").value="Hà Nội";document.getElementById("bfWard").value="Phường Cầu Giấy";document.getElementById("bfAddress").value="Test";RHUI.submitBuildingForm({preventDefault(){}})');
    assert.equal(await evaluate('RHD.list("buildings").some(b=>b.name==="CRUD Building")'), true);
    await evaluate('window.__crudBuilding=RHD.list("buildings").find(b=>b.name==="CRUD Building").id;RHUI.openBuildingForm(window.__crudBuilding);document.getElementById("bfName").value="CRUD Edited";RHUI.submitBuildingForm({preventDefault(){}})');
    assert.equal(await evaluate('RHD.get("buildings",window.__crudBuilding).name'), 'CRUD Edited');
    await evaluate('RHUI.deleteBuilding(window.__crudBuilding)');
    assert.equal(await evaluate('RHD.get("buildings",window.__crudBuilding)'), null);
    await evaluate('RHUI.deleteBuilding("reference-north")');
    assert.equal(await evaluate('!!RHD.get("buildings","reference-north")'), true, 'Existing apartment dependency still blocks deletion');

    await evaluate('switchTab("support");toggleNavGroup("rhAccountsGroup",true)');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#rhAccountsGroup .sidebar-menu-item span:not(.rh-nav-badge)")).map(n=>n.textContent)'), ['Loại tài khoản','Người dùng']);
    await send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(artifactDir, 'reference-accounts-menu.png'), Buffer.from(r.data, 'base64')));
    await evaluate('document.getElementById("rhAccountsMenuItem").click()');
    assert.equal(await evaluate('document.getElementById("rhAccountsMenuItem").getAttribute("aria-expanded")'), 'false');
    console.log('NAV_CSS_DIAGNOSTIC', await evaluate('JSON.stringify({display:getComputedStyle(document.getElementById("rhAccountsGroup")).display,rules:Array.from(document.styleSheets).flatMap(sheet=>Array.from(sheet.cssRules)).filter(rule=>rule.cssText.includes("rh-nav-children")).map(rule=>rule.cssText.slice(0,180))})'));
    assert.equal(await evaluate('getComputedStyle(document.getElementById("rhAccountsGroup")).display'), 'none');
    await evaluate('switchTab("roles")');
    assert.equal(await evaluate('document.getElementById("rhAccountsMenuItem").getAttribute("aria-expanded")'), 'true');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("rhAccountsGroup")).display'), 'block');
    await evaluate('RHAccounts.openRole();document.getElementById("rfName").value="UI Test Role";RHAccounts.submitRole({preventDefault(){}})');
    assert.equal(await evaluate('RHP.listTypes().some(t=>t.name==="UI Test Role")'), true);
    await evaluate('window.__uiRole=RHP.listTypes().find(t=>t.name==="UI Test Role").id;RHAccounts.openRole(window.__uiRole);document.getElementById("rfName").value="UI Role Edited";RHAccounts.submitRole({preventDefault(){}})');
    assert.equal(await evaluate('RHP.getType(window.__uiRole).name'), 'UI Role Edited');
    await evaluate('RHAccounts.deleteRole(window.__uiRole)');
    assert.equal(await evaluate('RHP.getType(window.__uiRole)'), null);

    await evaluate('switchTab("accounts");openAccountForm();document.getElementById("accountName").value="UI Staff";document.getElementById("accountEmail").value="ui-staff@example.test";document.getElementById("accountPassword").value="ui-test-pass";handleAccountFormSubmit({preventDefault(){}})');
    assert.equal(await evaluate('RH.getUsers().some(u=>u.email==="ui-staff@example.test")'), true);
    await evaluate('window.__uiStaff=RH.getUsers().find(u=>u.email==="ui-staff@example.test").id;openAccountForm(window.__uiStaff);document.getElementById("accountName").value="UI Staff Edited";handleAccountFormSubmit({preventDefault(){}})');
    assert.equal(await evaluate('RH.getUsers().find(u=>u.id===window.__uiStaff).name'), 'UI Staff Edited');
    await evaluate('toggleAccountLock(window.__uiStaff)');
    console.log('ACCOUNT_LOCK_AUDIT', await evaluate('RH.getUsers().find(u=>u.id===window.__uiStaff).status'));
    await evaluate('deleteAccount(window.__uiStaff)');
    assert.equal(await evaluate('RH.getUsers().some(u=>u.id===window.__uiStaff)'), false);

    const request = await evaluate(`RH.submitAccountRequest({fullName:'Approval Fixture',phone:'0901111222',email:'ui-approval@example.test',password:'ui-test-pass',buildingId:'reference-north',apartmentId:'reference-a1'})`);
    assert.equal(request.ok, true);
    await evaluate('refreshAccountViews();toggleNavGroup("rhAccountsGroup",true)');
    assert.equal(await evaluate('document.getElementById("rhNavAccountsCount").textContent'), '1');
    await evaluate(`openAccountRequestDrawer(${JSON.stringify(request.item.id)});submitApproveAccountRequest(${JSON.stringify(request.item.id)})`);
    assert.equal(await evaluate(`RH.getAccountRequest(${JSON.stringify(request.item.id)}).status`), 'approved');
    assert.equal(await evaluate('!!RH.getUsers().find(u=>u.email==="ui-approval@example.test").residentId'), true);

    // Menu-only permission probes. Do not change stored roles or backend behavior.
    await evaluate('window.__realCan=RHP.can;window.__realCanAny=RHP.canAny;RHP.can=key=>key==="roles.view";RHP.canAny=keys=>[].concat(keys).some(key=>RHP.can(key));applyNavPermissions()');
    assert.equal(await evaluate(`document.querySelector('#rhAccountsGroup [data-perm="roles.view"]').style.display`), '');
    assert.equal(await evaluate(`document.querySelector('#rhAccountsGroup [data-perm^="users.view"]').style.display`), 'none');
    await evaluate('RHP.can=()=>false;applyNavPermissions()');
    assert.equal(await evaluate('document.getElementById("rhAccountsMenuItem").style.display'), 'none');
    await evaluate('RHP.can=window.__realCan;RHP.canAny=window.__realCanAny;applyNavPermissions();switchTab("dashboard")');
    console.log('Passed reference building layout, CRUD/search/status, dependency guard; account group, role/user add/edit/delete, approval/resident link and menu permissions. Account locking is diagnosed separately.');
}
