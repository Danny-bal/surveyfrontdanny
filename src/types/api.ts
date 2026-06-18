export interface GenericResponse<T> {
  data: T;
  success: boolean;
  message: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
}

export interface Survey {
  id: number;
  surTitle: string;
  surDescription: string;
  surCreationDate: string;
  surCreatedBy: string;
}

export interface SurveyCreateRequest {
  surTitle: string;
  surDescription: string;
}

export interface Question {
  id: number;
  queName: string;
}

export interface QuestionCreateRequest {
  queName: string;
}

export interface SurveyQuestionAssignment {
  idQuestion: number;
  idTypeResponse: number;
  responseCreatedByClient: string[];
}

export interface ResponseType {
  id: number;
  name: string;
}

export interface SurveyForClientsCreateRequest {
  idSurvey: number;
  questionsPlusAnswers: SurveyQuestionAssignment[];
}

export interface PublicSurveyResponseOption {
  idResponse: number;
  nameResponse: string | null;
}

export interface PublicSurveyQuestion {
  idQuestion: number;
  nameQuestion: string;
  responseType: string | null;
  responseTypeId?: number | null;
  responsesQuestion: PublicSurveyResponseOption[] | null;
}

export interface PublicSurvey {
  surveyId: number;
  surveyName: string;
  questionListResponses: PublicSurveyQuestion[] | null;
}

export interface ResponseQuestionRequest {
  questionId: string;
  responseid: string;
  clientResponseWritten?: string;
}

export interface ResponseSurveyByClientRequest {
  idSurvey: string;
  responseQuestions: ResponseQuestionRequest[];
}

export interface SurveyGptRequest {
  temaEncuesta: string;
  objetivo: string;
  cantidadPreguntas: number;
}

export interface SurveyGptQuestion {
  name: string;
  responseTypeId: number;
  responsesCreated: string[];
}

export interface SurveyGptGenerated {
  surTitle: string;
  surDescription: string;
  questionName: SurveyGptQuestion[];
}

export interface SurveyGptResponse {
  surveyId: number;
  success: boolean;
  message: string;
  surveyGenerated: SurveyGptGenerated;
}

export interface SurveyAnswerParameter {
  questionName: string;
  questionAnswer: string;
}

export interface SurveyClientAnswers {
  userName: string;
  parametersRespondeds: SurveyAnswerParameter[];
}

export interface SessionUser {
  username: string;
  roles: string[];
}
