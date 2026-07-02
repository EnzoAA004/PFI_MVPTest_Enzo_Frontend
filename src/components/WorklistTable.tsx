import type { StudyRow } from "../appTypes";
import { fetchStudyDetail } from "../studyApi";
import { saveSelectedStudyDetail, saveSelectedStudyFallback } from "../selectedStudyStorage";
import { PriorityBadge, ReviewBadge } from "./StatusBadge";

interface WorklistTableProps {
  studies: StudyRow[];
  onOpenReview: (study: StudyRow) => void;
}

export function WorklistTable({ studies, onOpenReview }: WorklistTableProps) {
  async function openStudy(study: StudyRow) {
    saveSelectedStudyFallback(study);
    void fetchStudyDetail(study).then(saveSelectedStudyDetail).catch(() => undefined);
    onOpenReview(study);
  }

  return (
    <div className="table-wrap">
      <table className="worklist-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Subject Ref</th>
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
              <td><button className="ghost-button" onClick={() => void openStudy(study)} type="button">Review</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
