import subprocess

from django.core.mail.backends.base import BaseEmailBackend


class SendmailBackend(BaseEmailBackend):
    # шлях той самий, що спрацював у run_emailsend.py
    SENDMAIL = "/usr/sbin/sendmail"

    def send_messages(self, email_messages):
        sent = 0
        for m in email_messages:
            recipients = m.recipients()
            if not recipients:
                continue
            p = subprocess.run(
                [self.SENDMAIL, "-t", "-i", "-f", m.from_email],
                input=m.message().as_bytes(),
                capture_output=True,
            )
            if p.returncode == 0:
                sent += 1
            elif not self.fail_silently:
                raise RuntimeError(p.stderr.decode(errors="replace"))
        return sent