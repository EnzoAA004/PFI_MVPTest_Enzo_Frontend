import type { StudyRow } from "../appTypes";
import { PriorityBadge, ReviewBadge } from "./StatusBadge";

interface WorklistTableProps {
  studies: StudyRow[];
  onOpenReview: () => void;
}

export function WorklistTable({ studies, onOpenReview }: WorklistTableProps) {
  return (
    <div className="table-wrap">
      <table className="worklist-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient ID</th>
            <th>Plane</th>
            <th>Study Date</th>
            <th>Model Status</th>
            <th>Review Status</th>
            <th>Priority</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((study) => (
            <tr key={study.caseId}>
              <td><strong>{study.caseId}</strong><small>{study.modelKey}</small></td>
              <td>{study.patientId}</td>
              <td>{study.plane}</td>
              <td>{study.studyDate}</td>
              <td><span className="model-state">{study.modelStatus}</span></td>
              <td><ReviewBadge status={study.reviewStatus} /></td>
              <td><PriorityBadge priority={study.priority} /></td>
              <td><button className="ghost-button" onClick={onOpenReview} type="button">Review</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
