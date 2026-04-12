#!/usr/bin/env python3

import argparse
import json
import logging
from pathlib import Path
import sys

import yaml

from funasr.auto.auto_model import AutoModel


def extract_text(result):
    if isinstance(result, str):
        return result.strip()

    if isinstance(result, dict):
        text = result.get("text")
        if isinstance(text, str):
            return text.strip()
        return ""

    if isinstance(result, list):
        texts = []
        for item in result:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip() != "":
                    texts.append(text.strip())
            elif isinstance(item, str) and item.strip() != "":
                texts.append(item.strip())
        return "\n".join(texts).strip()

    return ""


def build_local_model_kwargs(model_path):
    model_dir = Path(model_path)
    config_path = model_dir / "config.yaml"
    if not config_path.is_file():
        raise FileNotFoundError(f"Missing config.yaml in local model path: {model_dir}")

    with config_path.open("r", encoding="utf-8") as handle:
        model_kwargs = yaml.safe_load(handle)

    if not isinstance(model_kwargs, dict):
        raise ValueError(f"Unexpected config.yaml contents in {model_dir}")

    model_kwargs["init_param"] = str(model_dir / "model.pt")

    tokenizer_conf = model_kwargs.get("tokenizer_conf")
    if not isinstance(tokenizer_conf, dict):
        tokenizer_conf = {}
    tokenizer_conf["token_list"] = str(model_dir / "tokens.json")
    tokenizer_conf["seg_dict"] = str(model_dir / "seg_dict")
    model_kwargs["tokenizer_conf"] = tokenizer_conf

    frontend_conf = model_kwargs.get("frontend_conf")
    if not isinstance(frontend_conf, dict):
        frontend_conf = {}
    frontend_conf["cmvn_file"] = str(model_dir / "am.mvn")
    model_kwargs["frontend_conf"] = frontend_conf

    return model_kwargs


def main():
    parser = argparse.ArgumentParser(description="Transcribe an audio file with FunASR and print JSON output.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--model")
    parser.add_argument("--model-path")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--model-revision", default="master")
    args = parser.parse_args()

    logging.getLogger().setLevel(logging.ERROR)

    if args.model_path:
        model = AutoModel(
            **build_local_model_kwargs(args.model_path),
            device=args.device,
        )
    else:
        if not args.model:
            raise ValueError("--model is required unless --model-path is provided")
        model = AutoModel(
            model=args.model,
            model_revision=args.model_revision,
            device=args.device,
        )

    result = model.generate(input=args.input)
    text = extract_text(result)
    json.dump({"text": text}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
