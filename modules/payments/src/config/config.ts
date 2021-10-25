export default {
  doc: 'Options for conduit payments provider',
  active: {
    format: 'Boolean',
    default: false,
  },
  stripe: {
    enabled: {
      format: 'Boolean',
      default: false,
    },
    secret_key: {
      format: 'String',
      default: '',
    },
  },
};
