function signTx(opType) {
    switch (netInput.value) {
        case 'tez':
            signTezTx(opType);
            break;
        case 'orbs':
        case 'iost':
            signETHTx(opType);
            break;
        case 'iost-coin':
            signIostCoinTx(opType);
            break;
        default:
            alert(`Net ${netInput.value} is currently unsupported`);
            break;
    }
}

function signTezTx(opType) {
    let req = new XMLHttpRequest();
    if (['transfer', 'origination', 'delegation'].includes(opType)) {
        req.open('POST', `/net/tez/address/${addressFromInput.value}/transactions/prepare-${opType}`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({
            toAddress: addressToInput.value,
            [opType == 'origination' ? 'balance' : 'amount']: amountInput.value
        }));
    }
    else if (opType == 'ballot') {
        req.open('POST', `/net/tez/voting/submit-ballot`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({
            votingId: 1,
            delegate: addressFromInput.value,
            ballot: amountInput.value
        }));
    }
    //On response...
    req.onloadend = () => {
        //Parse response from JSON
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);
        let privateKey = privateKeyInput.value;
        let signedTx = eztz.crypto.sign(tx.opbytes, privateKey, new Uint8Array([3]));
        //Sign prepared transaction with privateKey
        console.log('signedTx:', signedTx);
        //Send signed transaction
        req.open('POST', `/net/tez/address/${addressFromInput.value}/transactions/send`);
        req.setRequestHeader('Content-Type', 'application/json');

        req.send(JSON.stringify({ signedTransaction: { sopbytes: signedTx.sbytes } }));
        //On response display added transaction hash
        req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
    };
}

function signETHTx(opType) {
    let web3js = new Web3();
    //Send request to prepare operation of opType type from specified address
    let req = new XMLHttpRequest();
    req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/prepare-${opType}`);
    req.setRequestHeader('Content-Type', 'application/json');
    req.send(JSON.stringify({
        toAddress: addressToInput.value,
        amount: amountInput.value
    }));
    //On response...
    req.onloadend = () => {
        //Parse response from JSON
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);
        //Private key should start with 0x
        let privateKey = privateKeyInput.value;
        if (!privateKey.startsWith('0x')) {
            privateKey = '0x' + privateKey;
        }
        //Sign prepared transaction with privateKey
        web3js.eth.accounts.signTransaction(tx, privateKey).then(signedTx => {
            console.log('signedTx:', signedTx);
            //Send signed transaction
            req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/send`);
            req.setRequestHeader('Content-Type', 'application/json');
            req.send(JSON.stringify({ signedTransaction: signedTx.rawTransaction }));
            //On response display added transaction hash
            req.onloadend = () => alert('Sent! Hash: ' + req.responseText);
        });
    };
}

function signIostCoinTx(opType) {
    if (opType != 'transfer') {
        return alert('Operation is not supported!');
    }
    let iost = new IOST.IOST({ // will use default setting if not set
        gasRatio: 100,
        gasLimit: 2000000,
        delay: 0,
    }, new IOST.HTTPProvider('http://localhost:30001'));

    //Send request to prepare operation of opType type from specified address
    let req = new XMLHttpRequest();
    req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/prepare-${opType}`);
    req.setRequestHeader('Content-Type', 'application/json');
    req.send(JSON.stringify({
        toAddress: addressToInput.value,
        amount: amountInput.value
    }));
    //On response...
    req.onloadend = () => {
        //Parse response from JSON
        if (req.status !== 200) {
            alert(req.responseText);
            return;
        }

        let tx = JSON.parse(req.responseText);

        let privateKey = privateKeyInput.value;
        let kp = new IOST.KeyPair(Base58.decode(privateKey));
        let account = new IOST.Account();
        account.addKeyPair(kp, 'owner');
        account.addKeyPair(kp, 'active');

        let txObject = new IOST.Tx();
        for (let txKey in tx) {
            txObject[txKey] = tx[txKey];
        }

        account.signTx(txObject);

        let signedTx = JSON.parse(JSON.stringify(txObject));
        console.log('signedTx:', signedTx);
        //Send signed transaction
        req.open('POST', `/net/${netInput.value}/address/${addressFromInput.value}/transactions/send`);
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify({ signedTransaction: signedTx }));
        //On response display added transaction hash
        req.onloadend = () => alert('Sent! Hash: ' + req.responseText);

    }
}