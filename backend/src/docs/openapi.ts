import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import openApiRuntime from './openapi'

type OpenApiDocument = Record<string, unknown>
type OpenApiRuntime = {
  registry: OpenAPIRegistry
  schemas: Record<string, unknown>
  routeGroups: Record<string, unknown[]>
  openApiDocument: OpenApiDocument
  generateOpenApiDocument: () => OpenApiDocument
}

const openApi = openApiRuntime as OpenApiRuntime

export const registry: OpenAPIRegistry = openApi.registry
export const schemas: Record<string, unknown> = openApi.schemas
export const routeGroups: Record<string, unknown[]> = openApi.routeGroups
export const openApiDocument: OpenApiDocument = openApi.openApiDocument
export const generateOpenApiDocument: () => OpenApiDocument = openApi.generateOpenApiDocument

export default openApiDocument
