FROM registry.access.redhat.com/ubi10/python-312:latest

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY . /app

# OpenShift/OKD runs containers with a random UID. This keeps /app writable
# for that UID (which is in root group 0).
RUN chgrp -R 0 /app \
    && chmod -R g=u /app

EXPOSE 8080

CMD ["python", "server.py", "8080"]
