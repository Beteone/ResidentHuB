import { useState } from 'react';

export type StaffWageStatusValue = 'Dự kiến' | 'Chờ duyệt' | 'Đã duyệt' | 'Đã thanh toán';

export interface StaffWageRecord {
    id: string;
    staffId: string;
    taskId: string;
    taskTitle: string;
    taskDescription?: string;
    wageAmount: number;
    status: StaffWageStatusValue;
    period?: string;
    recordedAt?: string;
    reviewedAt?: string;
    paidAt?: string;
    materialCost?: number;
    materialCosts?: number;
}

interface StaffWageStatusProps {
    staffId: string;
    records: StaffWageRecord[];
}

const statusClassNames: Record<StaffWageStatusValue, string> = {
    'Dự kiến': 'staff-wage-status__badge--projected',
    'Chờ duyệt': 'staff-wage-status__badge--pending',
    'Đã duyệt': 'staff-wage-status__badge--approved',
    'Đã thanh toán': 'staff-wage-status__badge--paid',
};

const formatCurrency = (amount: number) => new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
}).format(amount);

export function StaffWageStatus({ staffId, records }: StaffWageStatusProps) {
    const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
    const personalRecords = records.filter(record => record.staffId === staffId);
    const totalWage = personalRecords.reduce((sum, record) => sum + record.wageAmount, 0);

    const toggleRecord = (recordId: string) => {
        setExpandedRecordId(currentId => currentId === recordId ? null : recordId);
    };

    return (
        <section className="staff-wage-status" aria-labelledby="staff-wage-status-title">
            <style>{`
                .staff-wage-status {
                    --staff-wage-ink: #10213c;
                    --staff-wage-muted: #61708a;
                    --staff-wage-line: #e4eaf2;
                    color: var(--staff-wage-ink);
                    font-family: 'Be Vietnam Pro', 'Segoe UI', sans-serif;
                }
                .staff-wage-status__header {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: flex-end;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 18px;
                }
                .staff-wage-status__title {
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                }
                .staff-wage-status__caption {
                    margin: 6px 0 0;
                    color: var(--staff-wage-muted);
                    font-size: 13px;
                }
                .staff-wage-status__total {
                    min-width: 190px;
                    padding: 14px 18px;
                    border: 1px solid var(--staff-wage-line);
                    border-radius: 12px;
                    background: #fff;
                }
                .staff-wage-status__total-label {
                    display: block;
                    color: var(--staff-wage-muted);
                    font-size: 12px;
                }
                .staff-wage-status__total-value {
                    display: block;
                    margin-top: 5px;
                    color: #0d65d5;
                    font-size: 20px;
                    font-weight: 700;
                }
                .staff-wage-status__panel {
                    overflow: hidden;
                    border: 1px solid var(--staff-wage-line);
                    border-radius: 12px;
                    background: #fff;
                }
                .staff-wage-status__table-wrap {
                    overflow-x: auto;
                }
                .staff-wage-status__table {
                    width: 100%;
                    min-width: 620px;
                    border-collapse: collapse;
                    text-align: left;
                }
                .staff-wage-status__table th,
                .staff-wage-status__table td {
                    padding: 13px 16px;
                    border-bottom: 1px solid var(--staff-wage-line);
                    vertical-align: middle;
                    font-size: 13px;
                }
                .staff-wage-status__table th {
                    background: #f7f9fc;
                    color: var(--staff-wage-muted);
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                }
                .staff-wage-status__row {
                    cursor: pointer;
                    transition: background .15s ease;
                }
                .staff-wage-status__row:hover,
                .staff-wage-status__row:focus {
                    outline: none;
                    background: #f7faff;
                }
                .staff-wage-status__task {
                    display: block;
                    font-weight: 600;
                }
                .staff-wage-status__task-id {
                    display: block;
                    margin-top: 4px;
                    color: var(--staff-wage-muted);
                    font-size: 11px;
                }
                .staff-wage-status__amount {
                    font-weight: 700;
                    white-space: nowrap;
                }
                .staff-wage-status__badge {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 999px;
                    padding: 5px 9px;
                    font-size: 11px;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .staff-wage-status__badge--projected {
                    background: #eef2f7;
                    color: #526174;
                }
                .staff-wage-status__badge--pending {
                    background: #fff4df;
                    color: #9a6700;
                }
                .staff-wage-status__badge--approved {
                    background: #eaf3ff;
                    color: #0d65d5;
                }
                .staff-wage-status__badge--paid {
                    background: #e6f8ef;
                    color: #16865e;
                }
                .staff-wage-status__detail {
                    padding: 16px;
                    border-bottom: 1px solid var(--staff-wage-line);
                    background: #f9fbfe;
                }
                .staff-wage-status__detail-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 12px;
                }
                .staff-wage-status__detail-item {
                    padding: 11px;
                    border-radius: 9px;
                    background: #fff;
                }
                .staff-wage-status__detail-item small {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--staff-wage-muted);
                }
                .staff-wage-status__description {
                    margin: 12px 0 0;
                    color: #334155;
                    line-height: 1.6;
                    white-space: pre-wrap;
                }
                .staff-wage-status__empty {
                    padding: 32px 16px;
                    color: var(--staff-wage-muted);
                    text-align: center;
                }
                @media (max-width: 560px) {
                    .staff-wage-status__title { font-size: 19px; }
                    .staff-wage-status__total { width: 100%; }
                }
            `}</style>
            <div className="staff-wage-status__header">
                <div>
                    <h2 className="staff-wage-status__title" id="staff-wage-status-title">Theo dõi trạng thái tiền công</h2>
                    <p className="staff-wage-status__caption">Chỉ hiển thị tiền công của tài khoản nhân viên này.</p>
                </div>
                <div className="staff-wage-status__total">
                    <span className="staff-wage-status__total-label">Tổng tiền công trong danh sách</span>
                    <strong className="staff-wage-status__total-value">{formatCurrency(totalWage)}</strong>
                </div>
            </div>

            <div className="staff-wage-status__panel">
                {personalRecords.length === 0 ? (
                    <div className="staff-wage-status__empty">Chưa có khoản tiền công nào được ghi nhận.</div>
                ) : (
                    <div className="staff-wage-status__table-wrap">
                        <table className="staff-wage-status__table">
                            <thead>
                                <tr>
                                    <th scope="col">Nhiệm vụ</th>
                                    <th scope="col">Kỳ tiền công</th>
                                    <th scope="col">Tiền công</th>
                                    <th scope="col">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {personalRecords.map(record => {
                                    const isExpanded = expandedRecordId === record.id;
                                    return (
                                        <FragmentRow
                                            key={record.id}
                                            record={record}
                                            isExpanded={isExpanded}
                                            onToggle={() => toggleRecord(record.id)}
                                        />
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function FragmentRow({
    record,
    isExpanded,
    onToggle,
}: {
    record: StaffWageRecord;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    return (
        <>
            <tr
                className="staff-wage-status__row"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={onToggle}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onToggle();
                    }
                }}
            >
                <td>
                    <span className="staff-wage-status__task">{record.taskTitle}</span>
                    <span className="staff-wage-status__task-id">Mã nhiệm vụ: {record.taskId}</span>
                </td>
                <td>{record.period || '—'}</td>
                <td className="staff-wage-status__amount">{formatCurrency(record.wageAmount)}</td>
                <td>
                    <span className={`staff-wage-status__badge ${statusClassNames[record.status]}`}>
                        {record.status}
                    </span>
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td className="staff-wage-status__detail" colSpan={4}>
                        <div className="staff-wage-status__detail-grid">
                            <div className="staff-wage-status__detail-item">
                                <small>Tiền công</small>
                                <strong>{formatCurrency(record.wageAmount)}</strong>
                            </div>
                            {record.recordedAt && (
                                <div className="staff-wage-status__detail-item">
                                    <small>Ngày ghi nhận</small>
                                    <strong>{record.recordedAt}</strong>
                                </div>
                            )}
                            {record.reviewedAt && (
                                <div className="staff-wage-status__detail-item">
                                    <small>Ngày duyệt</small>
                                    <strong>{record.reviewedAt}</strong>
                                </div>
                            )}
                            {record.paidAt && (
                                <div className="staff-wage-status__detail-item">
                                    <small>Ngày thanh toán</small>
                                    <strong>{record.paidAt}</strong>
                                </div>
                            )}
                        </div>
                        {record.taskDescription && (
                            <p className="staff-wage-status__description">{record.taskDescription}</p>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}
