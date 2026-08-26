FROM registry.access.redhat.com/ubi10/python-312-minimal:1787605542

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /opt/app-root/src

COPY . /opt/app-root/src

EXPOSE 8080

CMD ["python", "server.py", "8080"]
