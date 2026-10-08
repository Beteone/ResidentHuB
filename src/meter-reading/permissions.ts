// Bridge to the shared permission system (permissions.js → window.RHP).
// meters.* permissions and the user's building scope are decided there; this
// module only reads them, so the matrix in "Loại tài khoản" stays the single
// source of truth. Without RHP (e.g. an isolated build) everything is allowed.

export type MeterAction = 'view' | 'create' | 'update' | 'delete' | 'approve';

export interface MeterPermissions {
    /** Ghi số for a meter that has no reading yet this period. */
    create: boolean;
    /** Sửa an existing reading. */
    update: boolean;
    delete: boolean;
    /** Duyệt / bỏ duyệt. */
    approve: boolean;
}

export function canMeter(action: MeterAction): boolean {
    const p = window.RHP;
    return !p || p.can('meters.' + action);
}

export function deniedMessage(action: MeterAction): string {
    return window.RHP?.deniedMessage('meters.' + action) ?? 'Bạn không có quyền thực hiện thao tác này.';
}

export function inBuildingScope(buildingId: string): boolean {
    return !window.RHP || window.RHP.inScope(buildingId);
}

export function meterPermissions(): MeterPermissions {
    return { create: canMeter('create'), update: canMeter('update'), delete: canMeter('delete'), approve: canMeter('approve') };
}
