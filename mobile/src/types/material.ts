export interface StudyMaterial {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  subjectId: string;
  subject: {
    name: string;
    code: string;
  };
  createdAt: string;
}

export interface StudyMaterialsResponse {
  total: number;
  page?: number;
  limit?: number;
  materials: StudyMaterial[];
}
