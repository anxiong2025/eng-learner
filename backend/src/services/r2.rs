use anyhow::Result;
use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client,
};

pub struct R2Client {
    client: Client,
    bucket: String,
    public_url: String,
}

impl R2Client {
    pub async fn new(
        account_id: &str,
        access_key_id: &str,
        secret_access_key: &str,
        bucket: &str,
        public_url: &str,
    ) -> Result<Self> {
        let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);

        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "r2",
        );

        let config = aws_sdk_s3::Config::builder()
            .behavior_version_latest()
            .region(Region::new("auto"))
            .endpoint_url(&endpoint)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = Client::from_conf(config);

        Ok(Self {
            client,
            bucket: bucket.to_string(),
            public_url: public_url.trim_end_matches('/').to_string(),
        })
    }

    pub async fn upload(&self, key: &str, data: Vec<u8>, content_type: &str) -> Result<String> {
        let body = ByteStream::from(data);

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .send()
            .await?;

        // Return the public URL
        let url = format!("{}/{}", self.public_url, key);
        Ok(url)
    }

    #[allow(dead_code)]
    pub async fn delete(&self, key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        Ok(())
    }
}
