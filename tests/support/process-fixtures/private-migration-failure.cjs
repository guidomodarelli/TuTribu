/** Emits only a run-generated synthetic marker so the observation test can prove output redaction. @file private-migration-failure */
process.stdout.write(process.env.ADMISSION_SYNTHETIC_PRIVATE_OUTPUT);
process.stderr.write(process.env.ADMISSION_SYNTHETIC_PRIVATE_OUTPUT);
process.exitCode = 1;
