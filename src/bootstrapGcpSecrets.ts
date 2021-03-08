const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const GCP_SECRET_MAPPING = {
  BUILDKITE_TOKEN: 'elastic-buildkite-manager-buildkite-token',
  BUILDKITE_AGENT_TOKEN: 'elastic-buildkite-manager-buildkite-agent-token',
};

const getSecret = async (client, id) => {
  const [accessResponse] = await client.accessSecretVersion({
    name: `projects/261553193300/secrets/${id}/versions/latest`,
  });

  return accessResponse?.payload?.data?.toString();
};

export default async () => {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const client = new SecretManagerServiceClient();
  const envVars = Object.keys(GCP_SECRET_MAPPING).filter((key) => !(key in process.env));

  try {
    const values = await Promise.all(envVars.map((key) => getSecret(client, GCP_SECRET_MAPPING[key])));

    for (let i = 0; i < envVars.length; i++) {
      process.env[envVars[i]] = values[i];
    }
  } catch (ex) {
    console.error('Error bootstrapping secrets from GCP', ex);
    process.exit(1);
  }
};
