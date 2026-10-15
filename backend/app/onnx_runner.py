from __future__ import annotations
import io
from typing import List, Optional, Tuple, Dict, Any
import numpy as np
import onnxruntime as ort

class OnnxModelRunner:
    def __init__(self, model_bytes: bytes):
        if not model_bytes:
            raise ValueError("Empty model bytes provided.")
        try:
            self.sess = ort.InferenceSession(model_bytes, providers=["CPUExecutionProvider"])
        except Exception as e:
            raise ValueError(f"Could not load ONNX model: {e}")
        
        inputs = self.sess.get_inputs()
        if not inputs:
            raise ValueError("ONNX model has no inputs.")
        self.input_info = inputs[0]
        self.input_name = self.input_info.name
        self.input_shape = self.input_info.shape
        self.outputs = self.sess.get_outputs()
        self.output_names = [o.name for o in self.outputs]

    def get_expected_feature_count(self) -> Optional[int]:
        shape = self.input_shape
        if shape and len(shape) >= 2:
            second_dim = shape[1]
            if isinstance(second_dim, int) and second_dim > 0:
                return second_dim
        return None

    def run(self, X: np.ndarray) -> Tuple[Optional[np.ndarray], np.ndarray]:
        """
        Runs inference on X (must be float32 with appropriate feature count).
        Returns:
            (probabilities, labels)
            probabilities can be None if model does not output probabilities.
            labels are integer array of 0s and 1s.
        """
        expected_features = self.get_expected_feature_count()
        if expected_features is not None and X.shape[1] != expected_features:
            raise ValueError(f"The model expects {expected_features} input features but {X.shape[1]} were selected.")

        if X.dtype != np.float32:
            X = X.astype(np.float32)

        raw_outputs = self.sess.run(None, {self.input_name: X})
        
        prob_idx = None
        label_idx = None
        
        for idx, o in enumerate(self.outputs):
            name_lower = o.name.lower()
            if "prob" in name_lower and prob_idx is None:
                prob_idx = idx
            elif "label" in name_lower and label_idx is None:
                label_idx = idx

        probabilities: Optional[np.ndarray] = None
        if prob_idx is not None:
            raw_p = raw_outputs[prob_idx]
            # Handle ZipMap (list of dicts)
            if isinstance(raw_p, list) and len(raw_p) > 0 and isinstance(raw_p[0], dict):
                # zipmap: extract probability for positive class (key 1 or "1")
                extracted = []
                for d in raw_p:
                    if 1 in d:
                        extracted.append(float(d[1]))
                    elif "1" in d:
                        extracted.append(float(d["1"]))
                    else:
                        vals = list(d.values())
                        extracted.append(float(vals[-1]) if len(vals) > 0 else 0.0)
                probabilities = np.array(extracted, dtype=np.float32)
            else:
                p_arr = np.asarray(raw_p, dtype=np.float32)
                if p_arr.ndim == 2:
                    if p_arr.shape[1] == 2:
                        probabilities = p_arr[:, 1]
                    else:
                        probabilities = p_arr[:, 0]
                elif p_arr.ndim == 1:
                    probabilities = p_arr
                else:
                    probabilities = p_arr.ravel()

        labels: Optional[np.ndarray] = None
        if label_idx is not None:
            raw_l = raw_outputs[label_idx]
            l_arr = np.asarray(raw_l)
            labels = l_arr.ravel().astype(int)
        elif probabilities is not None:
            labels = (probabilities >= 0.5).astype(int)
        else:
            # Fallback to first output
            first_out = np.asarray(raw_outputs[0])
            if np.issubdtype(first_out.dtype, np.floating):
                probabilities = first_out.ravel().astype(np.float32)
                labels = (probabilities >= 0.5).astype(int)
            else:
                labels = first_out.ravel().astype(int)

        return probabilities, labels
