const { ZodError } = require('zod')

const validate = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body)
    }

    if (schema.query) {



      // Express 5: req.query is a getter-only property; writing to it is a silent no-op.
      // Store parsed/coerced result in req.validatedQuery so transforms and defaults reach controllers.
      req.validatedQuery = schema.query.parse(req.query)
    }

    if (schema.params) {
      req.params = schema.params.parse(req.params)
    }

    next()
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: error.flatten()
      })
    }

    next(error)
  }
}

module.exports = { validate }
