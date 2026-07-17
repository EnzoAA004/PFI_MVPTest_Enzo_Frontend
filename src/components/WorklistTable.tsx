import { useMemo, useState } from "react";
import { CircleDot, MoreHorizontal, Rows3 } from "lucide-react";
import type { Priority, ReviewStatus, StudyRow } from "../appTypes";
import { fetchStudyDetail } from "../studyApi";
import { loadSelectedStudyDetail, saveSelectedStudyDetail, saveSelectedStudyFallback } from "../selectedStudyStorage";
import { PriorityBadge, ReviewBadge } from "./StatusBadge";

type SortKey = "caseId" | "plane" | "studyDate" | "modelStatus" | "reviewStatus" | "priority";
type SortDirection = "asc" | "desc";
const PAGE_SIZE = 8;

interface WorklistTableProps {
  studies: StudyRow[];
  onOpenReview: (study: StudyRow) => void;
}

const reviewWeight: Record<ReviewStatus, number> = {
  observado: 0,
  pendiente: 1,
  aceptado: 2,
  descartado: 3,
};

const priorityWeight: Record<Priority, number> = {
  alta: 0,
  media: 1,
  baja: 2,
};

function valueForSort(study: StudyRow, key: SortKey): string | number {
  if (key === "reviewStatus") return reviewWeight[study.reviewStatus] ?? 99;
  if (key === "priority") return priorityWeight[study.priority] ?? 99;
  if (key === "studyDate") return Date.parse(study.studyDate) || 0;
  return String(study[key] ?? "").toLowerCase();
}

function compareStudy(a: StudyRow, b: StudyRow, key: SortKey, direction: SortDirection) {
  const first = valueForSort(a, key);
  const second = valueForSort(b, key);
  let result = 0;
  if (typeof first === "number" && typeof second === "number") result = first - second;
  else result = String(first).localeCompare(String(second));
  return direction === "asc" ? result : -result;
}

function sortLabel(active: boolean, direction: SortDirection) {
  if (!active) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function planeIcon(plane: string) {
  return plane === "axial" ? <CircleDot aria-hidden size={16} /> : <Rows3 aria-hidden size={16} />;
}

export function WorklistTable({ studies, onOpenReview }: WorklistTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("studyDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);
  const selectedStudy = loadSelectedStudyDetail()?.study;
  const sortedStudies = useMemo(() => [...studies].sort((a, b) => compareStudy(a, b, sortKey, sortDirection)), [sortDirection, sortKey, studies]);
  const pageCount = Math.max(1, Math.ceil(sortedStudies.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleStudies = sortedStudies.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const firstVisible = sortedStudies.length ? safePage * PAGE_SIZE + 1 : 0;
  const lastVisible = Math.min(sortedStudies.length, (safePage + 1) * PAGE_SIZE);

  function rowIdentity(study: StudyRow) {
    return study.runId ?? `${study.caseId}-${study.patientId}-${study.studyDate}-${study.plane}`;
  }

  function isSelected(study: StudyRow) {
    if (!selectedStudy) return false;
    if (selectedStudy.runId || study.runId) return selectedStudy.runId === study.runId;
    return rowIdentity(selectedStudy) === rowIdentity(study);
  }

  async function openStudy(study: StudyRow) {
    saveSelectedStudyFallback(study);
    void fetchStudyDetail(study).then(saveSelectedStudyDetail).catch(() => undefined);
    onOpenReview(study);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, study: StudyRow) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void openStudy(study);
    }
  }

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      setPage(0);
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "studyDate" || nextKey === "priority" || nextKey === "reviewStatus" ? "desc" : "asc");
    setPage(0);
  }

  function SortHeader({ column, children }: { column: SortKey; children: React.ReactNode }) {
    const active = sortKey === column;
    return (
      <th aria-sort={active ? sortDirection === "asc" ? "ascending" : "descending" : "none"}>
        <button className={`sortable-header ${active ? "active" : ""}`} onClick={() => changeSort(column)} type="button">
          <span>{children}</span>
          <em>{sortLabel(active, sortDirection)}</em>
        </button>
      </th>
    );
  }

  return (
    <div className="table-wrap">
      <table className="worklist-table selectable-worklist">
        <thead>
          <tr>
            <SortHeader column="caseId">Caso</SortHeader>
            <SortHeader column="plane">Plano</SortHeader>
            <SortHeader column="studyDate">Fecha</SortHeader>
            <SortHeader column="modelStatus">Modelo</SortHeader>
            <SortHeader column="reviewStatus">Revisión</SortHeader>
            <SortHeader column="priority">Prioridad</SortHeader>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {visibleStudies.map((study) => {
            const selected = isSelected(study);
            return (
              <tr key={rowIdentity(study)} className={`clickable-row ${selected ? "selected-worklist-row" : ""}`} tabIndex={0} onClick={() => void openStudy(study)} onKeyDown={(event) => handleKeyDown(event, study)} aria-current={selected ? "true" : undefined}>
                <td><button className="case-link" onClick={(event) => { event.stopPropagation(); void openStudy(study); }} type="button">{study.caseId}</button><small>{study.patientId}</small></td>
                <td><span className="plane-cell">{planeIcon(study.plane)}{study.plane}</span></td>
                <td>{study.studyDate}</td>
                <td><span className="model-state">{study.modelStatus}</span><small>{study.modelKey}</small></td>
                <td><ReviewBadge status={study.reviewStatus} /></td>
                <td><PriorityBadge priority={study.priority} /></td>
                <td><MoreHorizontal aria-hidden size={18} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="table-pagination" aria-label="Worklist pagination">
        <span>Showing {firstVisible} to {lastVisible} of {sortedStudies.length} studies</span>
        <div>
          <button className="ghost-button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">Previous</button>
          <span>{safePage + 1}</span>
          <button className="ghost-button" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button">Next</button>
        </div>
      </div>
    </div>
  );
}
